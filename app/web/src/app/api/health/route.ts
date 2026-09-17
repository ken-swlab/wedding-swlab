import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "wedding-sns-ctf",
    phase: "1-walking-skeleton",
    timestamp: new Date().toISOString(),
  });
}
