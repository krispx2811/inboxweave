import { NextResponse, type NextRequest } from "next/server";
import { acceptAllIgRequests } from "@/lib/channels/ig-requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Poll IG's Graph API for pending message requests and process them through
 * the normal inbound pipeline. Intended to run frequently (every minute via
 * external cron).
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (process.env.CRON_SECRET && key !== process.env.CRON_SECRET) {
    return new NextResponse("forbidden", { status: 403 });
  }
  const result = await acceptAllIgRequests();
  return NextResponse.json(result);
}
