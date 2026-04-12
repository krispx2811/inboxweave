import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendOutbound } from "@/lib/channels/router";

export const runtime = "nodejs";

/**
 * Cron endpoint to send scheduled messages.
 * Call this from Vercel Cron (vercel.json) or an external cron every 1 minute:
 *   GET /api/cron/scheduled?key=<CRON_SECRET>
 *
 * Picks up all pending scheduled_messages where scheduled_at <= now(),
 * sends them, and marks them as sent.
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (key !== process.env.CRON_SECRET && process.env.CRON_SECRET) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const { data: pending } = await admin
    .from("scheduled_messages")
    .select("id, org_id, conversation_id, content")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .limit(50);

  let sent = 0;
  let failed = 0;

  for (const msg of pending ?? []) {
    try {
      const { platformMessageId } = await sendOutbound({
        conversationId: msg.conversation_id as string,
        text: msg.content as string,
      });

      await admin.from("messages").insert({
        org_id: msg.org_id,
        conversation_id: msg.conversation_id,
        direction: "out",
        sender: "human",
        content: msg.content,
        platform_message_id: platformMessageId ?? null,
      });

      await admin
        .from("scheduled_messages")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", msg.id);
      sent++;
    } catch (err) {
      await admin
        .from("scheduled_messages")
        .update({ status: "failed", error: (err as Error).message })
        .eq("id", msg.id);
      failed++;
    }
  }

  return NextResponse.json({ sent, failed, total: (pending ?? []).length });
}
