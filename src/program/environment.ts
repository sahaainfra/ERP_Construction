// Environment validation (Part 04 REQ-CICD-F11). Fails on settings that must never reach production.

export const ENVIRONMENTS = ["development", "test", "staging", "production"] as const;

export function environmentProblems(env: Record<string, string | undefined>): string[] {
  const problems: string[] = [];
  const name = env.APP_ENV;
  if (!name || !(ENVIRONMENTS as readonly string[]).includes(name)) {
    problems.push(`APP_ENV must be one of ${ENVIRONMENTS.join(", ")}`);
    return problems;
  }
  // Placeholders and local credentials are expected in development and test; they must not reach staging or production.
  const sharedEnvironment = name === "staging" || name === "production";
  for (const [key, value] of Object.entries(env)) {
    if (sharedEnvironment && value && /CHANGE_ME|ci_only|erp_migrator_dev|erp_app_dev/.test(value)) {
      problems.push(`${key} holds a placeholder or local development credential`);
    }
    if (key.startsWith("NEXT_PUBLIC_") && /secret|password|token|private/i.test(key)) {
      problems.push(`${key} is exposed to the browser bundle and must not hold a secret`);
    }
  }
  if (name === "production") {
    for (const key of ["MIGRATOR_DATABASE_URL", "APP_DATABASE_URL"]) {
      const url = env[key];
      if (!url) {
        problems.push(`${key} is required in production`);
        continue;
      }
      if (/sslmode=disable/i.test(url)) problems.push(`${key} disables TLS (sslmode=disable)`);
      if (/localhost|127\.0\.0\.1/.test(url)) problems.push(`${key} points at localhost in production`);
    }
    if (env.MIGRATOR_DATABASE_URL && env.MIGRATOR_DATABASE_URL === env.APP_DATABASE_URL) {
      problems.push("the migrator and application database URLs are identical; the application must not own the schema (REQ-DBF-F15)");
    }
    for (const key of Object.keys(env)) {
      if (key.startsWith("TEST_")) problems.push(`${key} is a test setting and must not be set in production`);
    }
    if (env.NODE_ENV === "development") problems.push("NODE_ENV=development in production");
  }
  return problems;
}
