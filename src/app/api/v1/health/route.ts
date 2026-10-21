import { NextResponse } from "next/server";
import { getAppPool } from "@/db/app-pool";

// Liveness and database reachability for local checks and load balancers. It returns no configuration, versions or
// error text (U15): details stay in the server log.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getAppPool().query("SELECT 1");
    return NextResponse.json({ status: "ok", database: "ok" });
  } catch (error) {
    console.error("health: database check failed", (error as Error).name);
    return NextResponse.json({ status: "unavailable", database: "unavailable" }, { status: 503 });
  }
}
