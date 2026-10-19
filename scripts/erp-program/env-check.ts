// Validates the environment this process runs with (Part 04 REQ-CICD-F11). Run: npm run env:check (reads .env.local if present).
import { existsSync } from "node:fs";
import { environmentProblems } from "../../src/program/environment";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const problems = environmentProblems(process.env as Record<string, string | undefined>);
for (const p of problems) console.log(`ENV ${p}`);
console.log(problems.length === 0 ? `Environment ${process.env.APP_ENV ?? "(unset)"}: valid.` : `${problems.length} problem(s).`);
process.exitCode = problems.length === 0 ? 0 : 1;
