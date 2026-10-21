import { NextResponse } from "next/server";

// Liveness (Part 05 REQ-CORE-F15): the process answers. It does not touch the database, so a database outage does not restart the app.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "ok" });
}
