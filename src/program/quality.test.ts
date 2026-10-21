// Quality-gate tests (Part 04). Each block has known-bad fixtures that the gate must reject (Part 04 §17).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { breakingChanges, type OpenApiDocument } from "./contracts";
import { evaluateThresholds, failingGates, loweredThresholds, quarantineProblems, type GateConfig } from "./gates";
import { advanceRelease, approvalProblem, canAdvance, SEMVER } from "./release";
import { environmentProblems } from "./environment";
import { flagProblems, type FlagRecord } from "./flags";
import { auditProblems, AUD_DIMENSIONS, type AuditEntry } from "./audit";
import { secretFindings } from "./secrets";
import { FixedClock } from "../testing/clock";
import { volumeRange, volumeRow } from "../testing/volume";
import { getAppPool } from "../db/app-pool";
import { loadOpenApi } from "./openapi-fixture";

const root = join(__dirname, "../..");
const TODAY = new Date("2026-10-19T00:00:00Z");

describe("API contract diff (AC-4)", () => {
  const spec = loadOpenApi("health.v1.json");

  it("reports no breaking change for an identical document", () => {
    expect(breakingChanges(spec, spec)).toEqual([]);
  });

  it("flags a removed path", () => {
    const after: OpenApiDocument = { ...spec, paths: {} };
    expect(breakingChanges(spec, after).map((c) => c.detail)).toContain("path removed");
  });

  it("flags a removed response status", () => {
    const after = structuredClone(spec);
    delete after.paths["/api/v1/health"].get.responses["503"];
    expect(breakingChanges(spec, after).map((c) => c.detail)).toContain("response status removed");
  });

  it("flags a removed response property", () => {
    const after = structuredClone(spec);
    const schema = after.paths["/api/v1/health"].get.responses["200"].content!["application/json"].schema!;
    delete schema.properties!.database;
    expect(breakingChanges(spec, after).map((c) => c.detail)).toContain("property removed");
  });

  it("flags a changed property type", () => {
    const after = structuredClone(spec);
    after.paths["/api/v1/health"].get.responses["200"].content!["application/json"].schema!.properties!.status = { type: "integer" };
    expect(breakingChanges(spec, after).map((c) => c.detail)).toContain("type changed from string to integer");
  });

  it("flags a new required request property but accepts an added optional one", () => {
    const withBody = structuredClone(spec);
    withBody.paths["/api/v1/health"].get.requestBody = { content: { "application/json": { schema: { type: "object", properties: {} } } } };
    const required = structuredClone(withBody);
    required.paths["/api/v1/health"].get.requestBody = { content: { "application/json": { schema: { type: "object", required: ["token"], properties: { token: { type: "string" } } } } } };
    expect(breakingChanges(withBody, required).length).toBe(1);
    const optional = structuredClone(withBody);
    optional.paths["/api/v1/health"].get.requestBody = { content: { "application/json": { schema: { type: "object", properties: { note: { type: "string" } } } } } };
    expect(breakingChanges(withBody, optional)).toEqual([]);
  });
});

describe("health contract against the implementation (REQ-CICD-F01)", () => {
  const spec = loadOpenApi("health.v1.json");
  const schema = spec.paths["/api/v1/health"].get.responses["200"].content!["application/json"].schema!;
  const URL = process.env.TEST_APP_DATABASE_URL;
  const saved = process.env.APP_DATABASE_URL;

  beforeEach(() => {
    delete (globalThis as { __erpAppPool?: unknown }).__erpAppPool;
  });
  afterEach(() => {
    process.env.APP_DATABASE_URL = saved;
    delete (globalThis as { __erpAppPool?: unknown }).__erpAppPool;
  });

  it.skipIf(!URL)("returns a 200 body that matches the documented schema", async () => {
    process.env.APP_DATABASE_URL = URL;
    const { GET } = await import("../app/api/v1/health/route");
    const response = await GET();
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    for (const key of schema.required!) expect(typeof body[key]).toBe(schema.properties![key].type);
    expect(Object.keys(body).sort()).toEqual(["database", "status"]);
  });

  it.skipIf(!URL)("returns the documented 503 body without any detail when the database is unreachable", async () => {
    process.env.APP_DATABASE_URL = "postgres://erp_app:wrong@127.0.0.1:1/none";
    const { GET } = await import("../app/api/v1/health/route");
    const response = await GET();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({ status: "unavailable", database: "unavailable" });
    void getAppPool;
  });
});

describe("threshold changes (CP-CICD-01, REQ-CICD-F02)", () => {
  const config: GateConfig = {
    thresholds: [{ name: "coverage.lines", value: 80, direction: "min", reason: "baseline" }],
    mandatoryGates: ["lint", "typecheck", "unit"],
  };

  it("passes a metric at or above a minimum and fails one below", () => {
    expect(evaluateThresholds(config, { "coverage.lines": 80 })[0].ok).toBe(true);
    expect(evaluateThresholds(config, { "coverage.lines": 79.9 })[0].ok).toBe(false);
  });

  it("fails a metric that was not measured", () => {
    expect(evaluateThresholds(config, {})[0].ok).toBe(false);
  });

  it("refuses to lower a threshold without two approvers and a reason", () => {
    const lowered: GateConfig = { ...config, thresholds: [{ ...config.thresholds[0], value: 70, reason: "short" }] };
    expect(loweredThresholds(config, lowered, {})).toHaveLength(2);
    const approved = { "coverage.lines": ["owner", "technical lead"] };
    const withReason: GateConfig = { ...config, thresholds: [{ ...config.thresholds[0], value: 70, reason: "legacy module exempted until Part 83" }] };
    expect(loweredThresholds(config, withReason, approved)).toEqual([]);
  });

  it("lists every mandatory gate that is not green", () => {
    expect(failingGates(config, { lint: "pass", typecheck: "skipped" })).toEqual(["typecheck", "unit"]);
  });
});

describe("quarantine (REQ-CICD-F14)", () => {
  it("flags an expired quarantine and one without an owner", () => {
    const problems = quarantineProblems(
      [
        { test: "a", reason: "flaky", owner: "x", expires_at: "2026-09-01" },
        { test: "b", reason: "flaky", owner: "", expires_at: "2027-01-01" },
      ],
      TODAY,
    );
    expect(problems).toHaveLength(2);
  });

  it("accepts a current quarantine with an owner", () => {
    expect(quarantineProblems([{ test: "c", reason: "flaky", owner: "x", expires_at: "2027-01-01" }], TODAY)).toEqual([]);
  });
});

describe("release state machine and approval (REQ-CICD-F10, CP-CICD-03)", () => {
  it("advances in order and refuses a skip", () => {
    expect(advanceRelease("DRAFT", "CANDIDATE")).toBe("CANDIDATE");
    expect(canAdvance("CANDIDATE", "APPROVED")).toBe(false);
    expect(() => advanceRelease("CANDIDATE", "LIVE")).toThrow(RangeError);
  });

  it("refuses approval by the author", () => {
    expect(approvalProblem("Ravi", "ravi")).toMatch(/cannot approve their own/);
    expect(approvalProblem("author", "approver")).toBeNull();
    expect(approvalProblem("author", " ")).toMatch(/approver is required/);
  });

  it("accepts semantic versions only", () => {
    expect(SEMVER.test("1.2.3")).toBe(true);
    expect(SEMVER.test("1.2")).toBe(false);
    expect(SEMVER.test("01.2.3")).toBe(false);
  });
});

describe("environment validation (REQ-CICD-F11)", () => {
  const good = {
    APP_ENV: "production",
    MIGRATOR_DATABASE_URL: "postgres://migrator:x@db.internal:5432/erp?sslmode=require",
    APP_DATABASE_URL: "postgres://app:x@db.internal:5432/erp?sslmode=require",
  };

  it("accepts a production configuration", () => {
    expect(environmentProblems(good)).toEqual([]);
  });

  it("rejects TLS disabled, localhost, placeholders and shared roles in production", () => {
    expect(environmentProblems({ ...good, APP_DATABASE_URL: "postgres://app:x@db.internal/erp?sslmode=disable" }).join(" ")).toMatch(/disables TLS/);
    expect(environmentProblems({ ...good, APP_DATABASE_URL: "postgres://app:x@localhost/erp?sslmode=require" }).join(" ")).toMatch(/localhost/);
    expect(environmentProblems({ ...good, APP_DATABASE_URL: "postgres://erp_app:CHANGE_ME@db/erp" }).join(" ")).toMatch(/placeholder/);
    expect(environmentProblems({ ...good, APP_DATABASE_URL: good.MIGRATOR_DATABASE_URL }).join(" ")).toMatch(/identical/);
  });

  it("rejects test settings and browser-exposed secrets", () => {
    expect(environmentProblems({ ...good, TEST_DATABASE_URL: "postgres://x" }).join(" ")).toMatch(/test setting/);
    expect(environmentProblems({ ...good, NEXT_PUBLIC_API_TOKEN: "abc" }).join(" ")).toMatch(/browser bundle/);
  });

  it("accepts local development credentials in development, but not in staging", () => {
    const dev = { APP_ENV: "development", APP_DATABASE_URL: "postgres://erp_app:erp_app_dev@localhost:5432/erp_dev" };
    expect(environmentProblems(dev)).toEqual([]);
    expect(environmentProblems({ ...dev, APP_ENV: "staging" }).join(" ")).toMatch(/placeholder/);
  });

  it("requires a known environment name", () => {
    expect(environmentProblems({ APP_ENV: "prod" })[0]).toMatch(/APP_ENV must be one of/);
  });
});

describe("feature flags (REQ-CICD-F09, CP-CICD-06)", () => {
  const base: FlagRecord = { key: "ff.proc.rfq", owner: "procurement", module_code: "proc", defaults_by_env: { production: false }, kill_switch: true };

  it("accepts a flag that is off in production with a kill switch", () => {
    expect(flagProblems(base, TODAY)).toEqual([]);
  });

  it("refuses a production default of ON, a bad key and a missing kill switch", () => {
    expect(flagProblems({ ...base, defaults_by_env: { production: true } }, TODAY).join(" ")).toMatch(/default ON in production/);
    expect(flagProblems({ ...base, key: "proc.rfq" }, TODAY).join(" ")).toMatch(/key must be/);
    expect(flagProblems({ ...base, kill_switch: false }, TODAY).join(" ")).toMatch(/kill switch/);
  });

  it("requires business-owner approval for a financial flag ON in production", () => {
    const financial = { ...base, financial: true, defaults_by_env: { production: true } };
    expect(flagProblems(financial, TODAY).join(" ")).toMatch(/business-owner approval|default ON/);
  });

  it("reports a flag fully ON for more than 90 days", () => {
    expect(flagProblems({ ...base, fully_on_since: "2026-01-01" }, TODAY).join(" ")).toMatch(/schedule its removal/);
  });
});

describe("audit assembly (REQ-CICD-F12, Part 00 §5.8)", () => {
  const full: AuditEntry[] = AUD_DIMENSIONS.map((dimension) => ({ dimension, result: "N/A", reason: "not applicable to this Part yet" }));

  it("passes when every dimension has a result", () => {
    expect(auditProblems(full, () => true)).toEqual([]);
  });

  it("flags a missing dimension, a failure and a PASS whose evidence is absent", () => {
    const entries = full.slice(1);
    entries[0] = { dimension: AUD_DIMENSIONS[1], result: "FAIL" };
    entries[1] = { dimension: AUD_DIMENSIONS[2], result: "PASS", evidence: "docs/missing.md" };
    const problems = auditProblems(entries, (p) => p !== "docs/missing.md");
    expect(problems.join(" | ")).toMatch(/AUD-1 functional: no entry/);
    expect(problems.join(" | ")).toMatch(/FAIL/);
    expect(problems.join(" | ")).toMatch(/PASS without an existing evidence file/);
  });

  it("requires a reason for N/A", () => {
    expect(auditProblems([...full.slice(1), { dimension: AUD_DIMENSIONS[0], result: "N/A", reason: "x" }], () => true).join(" ")).toMatch(/N\/A needs a reason/);
  });
});

describe("secret scan (Part 04 security slot)", () => {
  it("detects an AWS key, a private key block and an assigned secret", () => {
    const text = [
      "const id = 'AKIAABCDEFGHIJKLMNOP';",
      "-----BEGIN RSA PRIVATE KEY-----",
      "const api_key = 'abcdefgh12345678';",
      "const harmless = 'hello';",
    ].join("\n");
    expect(secretFindings(text).map((f) => f.kind)).toEqual(["awsAccessKey", "privateKeyBlock", "assignedSecret"]);
  });

  it("never returns the matched value", () => {
    const hits = secretFindings("const password = 'supersecretvalue';");
    expect(JSON.stringify(hits)).not.toContain("supersecretvalue");
  });
});

describe("volume generator and clock (REQ-CICD-F04, F05)", () => {
  it("produces the same rows for the same seed and range", () => {
    expect(volumeRange(42, 1, 50)).toEqual(volumeRange(42, 1, 50));
  });

  it("gives a row the same content whether it is generated alone or in a range", () => {
    expect(volumeRange(42, 7, 9)[1]).toEqual(volumeRow(42, 8));
  });

  it("changes with the seed", () => {
    expect(volumeRow(1, 5)).not.toEqual(volumeRow(2, 5));
  });

  it("moves a fixed clock by whole days", () => {
    const clock = new FixedClock("2026-10-19T00:00:00Z");
    clock.advanceDays(3);
    expect(clock.now().toISOString().slice(0, 10)).toBe("2026-10-22");
  });
});

describe("gate configuration files", () => {
  it("feature-flag registry holds only the reference flag, off everywhere, and every entry passes the flag rules", () => {
    const flags = JSON.parse(readFileSync(join(root, "docs/erp-program/feature-flags.json"), "utf8")) as FlagRecord[];
    expect(flags.map((f) => f.key)).toEqual(["ff.core.sample"]);
    for (const f of flags) {
      expect(Object.values(f.defaults_by_env).every((v) => v === false)).toBe(true);
      expect(flagProblems(f, TODAY)).toEqual([]);
    }
  });

  it("are present and valid JSON", () => {
    const quality = JSON.parse(readFileSync(join(root, "docs/erp-program/quality-gates.json"), "utf8")) as GateConfig;
    expect(quality.mandatoryGates).toContain("unit");
    expect(JSON.parse(readFileSync(join(root, "docs/erp-program/quarantine.json"), "utf8"))).toEqual([]);
  });
});
