import { Pool, type PoolConfig } from "pg";

// Pool defaults follow Part 03 §15: bounded connections, a statement timeout, and a named application for pg_stat_activity.
export function createPool(connectionString: string, options: Partial<PoolConfig> = {}): Pool {
  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 30_000,
    application_name: "erp-construction",
    ...options,
  });
}
