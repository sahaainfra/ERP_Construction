import { NextResponse } from "next/server";
import { getAppPool } from "@/db/app-pool";

// Readiness (Part 05 REQ-CORE-F15). Only the database is wired today, so only it is checked. Components that are not configured are
// reported as "not_configured" rather than "ok", so no check claims more than it measures (Part 00 U15: no internal detail is returned).
export const dynamic = "force-dynamic";

export async function GET() {
  let database: "ok" | "unavailable" = "ok";
  try {
    await getAppPool().query("SELECT 1");
  } catch (error) {
    console.error("ready: database check failed", (error as Error).name);
    database = "unavailable";
  }
  const body = {
    status: database === "ok" ? "ready" : "not_ready",
    components: {
      database,
      queue: "database",
      cache: "in_process",
      storage: "not_configured",
    },
  };
  return NextResponse.json(body, { status: database === "ok" ? 200 : 503 });
}
