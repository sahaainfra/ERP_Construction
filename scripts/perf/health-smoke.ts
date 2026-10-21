// Performance smoke (Part 04 REQ-CICD-F01, budget in docs/erp-program/quality-gates.json). Measures p95 latency of the health endpoint.
//   BASE_URL=http://localhost:3000 npm run perf:smoke
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const base = process.env.BASE_URL ?? "http://localhost:3000";
const REQUESTS = Number(process.env.SMOKE_REQUESTS ?? 300);
const CONCURRENCY = Number(process.env.SMOKE_CONCURRENCY ?? 10);

async function main(): Promise<number> {
  const gates = JSON.parse(readFileSync(join(root, "docs/erp-program/quality-gates.json"), "utf8")) as {
    thresholds: { name: string; value: number }[];
  };
  const budget = gates.thresholds.find((t) => t.name === "perf.health.p95Ms")?.value ?? 500;
  const timings: number[] = [];
  let next = 0;
  const worker = async () => {
    while (next < REQUESTS) {
      next += 1;
      const started = performance.now();
      const response = await fetch(`${base}/api/v1/health`);
      await response.arrayBuffer();
      timings.push(performance.now() - started);
      if (response.status !== 200) throw new Error(`health returned ${response.status}`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  timings.sort((a, b) => a - b);
  const p95 = timings[Math.min(timings.length - 1, Math.ceil(timings.length * 0.95) - 1)];
  console.log(`health: ${timings.length} requests, concurrency ${CONCURRENCY}, p50 ${timings[Math.floor(timings.length / 2)].toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, budget ${budget} ms`);
  console.log(p95 <= budget ? "RESULT: within budget" : "RESULT: over budget");
  return p95 <= budget ? 0 : 1;
}

main().then((code) => { process.exitCode = code; }).catch((error) => {
  console.error(`perf smoke failed: ${(error as Error).message}`);
  process.exitCode = 1;
});
