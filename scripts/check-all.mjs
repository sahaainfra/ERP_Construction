// Runs every local gate in order and prints one line per gate (developer tool; mirrors the CI order in LOCALHOST.md §7).
// It keeps going after a failure so that one run shows every problem. Exit code 1 if any gate failed.
// Loads .env.test when present, so the database tests run; without it they are skipped and the summary says so.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { connect } from "node:net";

if (existsSync(".env.test")) process.loadEnvFile(".env.test");

const GATES = [
  ["types", "npx tsc --noEmit"],
  ["lint", "npm run lint"],
  ["architecture", "npm run arch:check"],
  ["migration lint", "npm run db:lint"],
  ["tests + coverage", "npx vitest run --coverage"],
  ["golden baseline", "npm run baseline:check"],
  ["secret scan", "npm run secret:scan"],
  ["design contrast", "npm run check:design"],
  ["route registry", "npm run iam:routes"],
];

/** Whether a TCP connection to the test database host and port succeeds. Database tests fail in confusing ways without it. */
function databaseReachable(url) {
  if (!url) return Promise.resolve(false);
  const { hostname, port } = new URL(url);
  return new Promise((resolve) => {
    const socket = connect({ host: hostname, port: Number(port || 5432), timeout: 2000 });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(false));
  });
}

const dbUrl = process.env.TEST_DATABASE_URL;
if (dbUrl && !(await databaseReachable(dbUrl))) {
  console.log("WARNING: the test database is not reachable. Start PostgreSQL first (on Ubuntu: sudo pg_ctlcluster 16 main start), then re-run.");
}

const results = GATES.map(([name, cmd]) => {
  const started = Date.now();
  const run = spawnSync(cmd, { shell: true, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", env: process.env });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const ok = run.status === 0;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(18)} ${seconds}s  ${cmd}`);
  if (!ok) console.log((run.stdout + run.stderr).split("\n").slice(-8).map((l) => `      ${l}`).join("\n"));
  return ok;
});

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed} of ${results.length} gates passed.`);
if (!process.env.DATABASE_TEST_URL && !process.env.TEST_DATABASE_URL) console.log("Note: TEST_DATABASE_URL is not set, so the database tests were skipped.");
process.exitCode = failed > 0 ? 1 : 0;
