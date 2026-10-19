import type { Pool } from "pg";
import { requireUrl } from "./config";
import { createPool } from "./pool";

// One application pool per server process. Cached on globalThis so that hot reload in development does not open new pools.
const globalForPool = globalThis as unknown as { __erpAppPool?: Pool };

export function getAppPool(): Pool {
  if (!globalForPool.__erpAppPool) {
    globalForPool.__erpAppPool = createPool(requireUrl("APP_DATABASE_URL"));
  }
  return globalForPool.__erpAppPool;
}
