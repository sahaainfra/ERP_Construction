// Authentication flow acceptance tests (Part 07 S1). Run against the test database; skipped without it.
import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../db/pool";
import { loadMigrations } from "../db/migrations";
import { migrateUp, resetForTests } from "../db/migrator";
import { withTransaction } from "../db/transactions";
import { base32Decode, totpAt } from "./crypto";
import { confirmTotp, createCredentials, enrolTotp, login, redeemPasswordReset, refreshSession, requestPasswordReset, revokeDevice, verifyAccess, type Keys } from "./auth";

const TEST_URL = process.env.TEST_DATABASE_URL;
const APP_URL = process.env.TEST_APP_DATABASE_URL;
const dir = join(__dirname, "../../db/migrations");
const PASSWORD = "a long quiet passphrase 1";
const NEW_PASSWORD = "another long quiet passphrase 2";

async function expectRefused(work: Promise<unknown>, text?: string): Promise<void> {
  const error = await work.then(
    () => null,
    (e: { code?: string; reason?: string; message?: string }) => e,
  );
  expect(error, "expected the attempt to be refused").not.toBeNull();
  if (text) expect(`${(error as { reason?: string }).reason ?? ""} ${(error as { message?: string }).message ?? ""}`).toContain(text);
}

describe.skipIf(!TEST_URL || !APP_URL)("authentication flows (Part 07 S1)", () => {
  let owner: Pool;
  let app: Pool;
  const keys: Keys = { tokenKey: randomBytes(32), mfaKey: randomBytes(32) };

  beforeAll(async () => {
    owner = createPool(TEST_URL!, { application_name: "erp-authtest" });
    app = createPool(APP_URL!, { application_name: "erp-authtest-app" });
    await resetForTests(owner);
    await migrateUp(owner, loadMigrations(dir));
  });

  afterAll(async () => {
    await app?.end();
    await owner?.end();
  });

  it("signs in with a password, issues a verifiable access token, and refuses unknown users in the same way", async () => {
    const tenant = randomUUID();
    const user = randomUUID();
    await createCredentials(app, tenant, user, PASSWORD);
    const session = await login(app, keys, { tenantId: tenant, userRef: user, password: PASSWORD, deviceFingerprint: "laptop-1" });
    expect(await verifyAccess(app, keys, { tenantId: tenant, accessToken: session.accessToken })).toMatchObject({ userRef: user });
    await expectRefused(login(app, keys, { tenantId: tenant, userRef: randomUUID(), password: PASSWORD, deviceFingerprint: "x" }), "invalid credentials");
    await expectRefused(login(app, keys, { tenantId: tenant, userRef: user, password: "wrong passphrase here", deviceFingerprint: "x" }), "invalid credentials");
  });

  it("locks the account after repeated failures, even for the right password, until the lock passes", async () => {
    const tenant = randomUUID();
    const user = randomUUID();
    await createCredentials(app, tenant, user, PASSWORD);
    for (let i = 0; i < 5; i++) await expectRefused(login(app, keys, { tenantId: tenant, userRef: user, password: "wrong passphrase here", deviceFingerprint: "d" }));
    await expectRefused(login(app, keys, { tenantId: tenant, userRef: user, password: PASSWORD, deviceFingerprint: "d" }), "temporarily locked");
    const later = new Date(Date.now() + 16 * 60_000);
    await login(app, keys, { tenantId: tenant, userRef: user, password: PASSWORD, deviceFingerprint: "d", now: later });
  });

  it("rotates the refresh token, and ends the whole sign-in when an old refresh token is presented again", async () => {
    const tenant = randomUUID();
    const user = randomUUID();
    await createCredentials(app, tenant, user, PASSWORD);
    const first = await login(app, keys, { tenantId: tenant, userRef: user, password: PASSWORD, deviceFingerprint: "tablet-1" });
    const second = await refreshSession(app, keys, { tenantId: tenant, refreshToken: first.refreshToken });
    expect(second.refreshToken).not.toBe(first.refreshToken);
    await expectRefused(refreshSession(app, keys, { tenantId: tenant, refreshToken: first.refreshToken }), "sign in again");
    await expectRefused(verifyAccess(app, keys, { tenantId: tenant, accessToken: second.accessToken }), "ended");
  });

  it("ends a device's sessions at once when the device is revoked", async () => {
    const tenant = randomUUID();
    const user = randomUUID();
    await createCredentials(app, tenant, user, PASSWORD);
    const session = await login(app, keys, { tenantId: tenant, userRef: user, password: PASSWORD, deviceFingerprint: "kiosk-7" });
    await revokeDevice(app, tenant, session.deviceId, "device reported lost");
    await expectRefused(verifyAccess(app, keys, { tenantId: tenant, accessToken: session.accessToken }), "ended");
    await expectRefused(login(app, keys, { tenantId: tenant, userRef: user, password: PASSWORD, deviceFingerprint: "kiosk-7" }), "revoked");
  });

  it("refuses everything for a leaver whose access is revoked, including a live access token", async () => {
    const tenant = randomUUID();
    const user = randomUUID();
    await createCredentials(app, tenant, user, PASSWORD);
    const session = await login(app, keys, { tenantId: tenant, userRef: user, password: PASSWORD, deviceFingerprint: "office-1" });
    await withTransaction(owner, (c) => c.query("INSERT INTO iam_revocations (tenant_id, user_ref, reason, revoked_by) VALUES ($1, $2, 'Left the company', 'hr-event')", [tenant, user]), { tenantId: tenant });
    await expectRefused(verifyAccess(app, keys, { tenantId: tenant, accessToken: session.accessToken }), "revoked");
    await expectRefused(login(app, keys, { tenantId: tenant, userRef: user, password: PASSWORD, deviceFingerprint: "office-1" }), "revoked");
  });

  it("ends an access token after its idle time, and refuses an expired token", async () => {
    const tenant = randomUUID();
    const user = randomUUID();
    await createCredentials(app, tenant, user, PASSWORD);
    const session = await login(app, keys, { tenantId: tenant, userRef: user, password: PASSWORD, deviceFingerprint: "idle-1" });
    // The access token ends after 10 minutes; the idle timeout (8 hours) is enforced when it is refreshed.
    await expectRefused(verifyAccess(app, keys, { tenantId: tenant, accessToken: session.accessToken, now: new Date(Date.now() + 11 * 60_000) }), "not valid");
    await expectRefused(refreshSession(app, keys, { tenantId: tenant, refreshToken: session.refreshToken, now: new Date(Date.now() + 9 * 3_600_000) }), "sign in again");
  });

  it("resets a password once, refuses a weak one, and ends every session of the person", async () => {
    const tenant = randomUUID();
    const user = randomUUID();
    await createCredentials(app, tenant, user, PASSWORD);
    const session = await login(app, keys, { tenantId: tenant, userRef: user, password: PASSWORD, deviceFingerprint: "phone-1" });
    expect(await requestPasswordReset(app, tenant, randomUUID())).toBeNull();
    const token = await requestPasswordReset(app, tenant, user);
    expect(token).toEqual(expect.any(String));
    await expectRefused(redeemPasswordReset(app, tenant, token!, "password1234 weak"), "common");
    await redeemPasswordReset(app, tenant, token!, NEW_PASSWORD);
    await expectRefused(redeemPasswordReset(app, tenant, token!, NEW_PASSWORD), "not valid");
    await expectRefused(verifyAccess(app, keys, { tenantId: tenant, accessToken: session.accessToken }), "ended");
    await expectRefused(login(app, keys, { tenantId: tenant, userRef: user, password: PASSWORD, deviceFingerprint: "phone-1" }), "invalid credentials");
    await login(app, keys, { tenantId: tenant, userRef: user, password: NEW_PASSWORD, deviceFingerprint: "phone-1" });
  });

  it("requires a confirmed TOTP code at sign-in, and refuses the same code twice", async () => {
    const tenant = randomUUID();
    const user = randomUUID();
    await createCredentials(app, tenant, user, PASSWORD);
    const { secret } = await enrolTotp(app, keys, tenant, user);
    const raw = base32Decode(secret);
    const now = new Date();
    const step = Math.floor(now.getTime() / 1000 / 30);
    await confirmTotp(app, keys, tenant, user, totpAt(raw, step), now);
    await expectRefused(login(app, keys, { tenantId: tenant, userRef: user, password: PASSWORD, deviceFingerprint: "mfa-1", now }), "one-time code is required");
    const code = totpAt(raw, step + 2);
    await login(app, keys, { tenantId: tenant, userRef: user, password: PASSWORD, deviceFingerprint: "mfa-1", mfaCode: code, now: new Date(now.getTime() + 60_000) });
    await expectRefused(login(app, keys, { tenantId: tenant, userRef: user, password: PASSWORD, deviceFingerprint: "mfa-1", mfaCode: code, now: new Date(now.getTime() + 60_000) }), "not valid");
  });

  it("keeps one tenant's credentials away from another tenant", async () => {
    const a = randomUUID();
    const user = randomUUID();
    await createCredentials(app, a, user, PASSWORD);
    await expectRefused(login(app, keys, { tenantId: randomUUID(), userRef: user, password: PASSWORD, deviceFingerprint: "x" }), "invalid credentials");
  });
});
