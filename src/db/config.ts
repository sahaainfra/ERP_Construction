// Database connection settings (Part 03 REQ-DBF-F15). Two roles exist by design:
//   MIGRATOR_DATABASE_URL  owns the schema and runs DDL. Used only by migration and maintenance tools.
//   APP_DATABASE_URL       the application role: DML only, no DDL, no superuser. Used by the running server.
// Each variable is read from the environment. In local development they are set in .env.local (see LOCALHOST.md).

export function requireUrl(name: "MIGRATOR_DATABASE_URL" | "APP_DATABASE_URL" | "TEST_DATABASE_URL" | "TEST_APP_DATABASE_URL", env: NodeJS.ProcessEnv = process.env): string {
  const value = env[name];
  if (!value || value.trim() === "") {
    throw new Error(`${name} is not set. Copy .env.example to .env.local and set it (see LOCALHOST.md).`);
  }
  if (!/^postgres(ql)?:\/\//.test(value)) {
    throw new Error(`${name} must be a postgres:// connection string. The value is not printed.`);
  }
  return value;
}
