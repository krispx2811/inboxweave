import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendOutbound } from "@/lib/channels/router";

export const runtime = "nodejs";

/**
 * POST /api/typing — broadcast a typing indicator via Supabase Realtime.
 * Body: { orgId, conversationId, userId }
 *
 * The inbox client listens for presence events on the org channel.
 * WhatsApp/Messenger typing indicators are sent via the platform API.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("unauthorized", { status: 401 });

  const body = (await req.json()) as { orgId?: string; conversationId?: string };
  if (!body.orgId || !body.conversationId) {
    return new NextResponse("missing fields", { status: 400 });
  }

  // Verify membership.
  const admin = createSupabaseAdminClient();
  const { data: member } = await admin
    .from("org_members")
    .select("role")
    .eq("org_id", body.orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) return new NextResponse("forbidden", { status: 403 });

  // Broadcast typing event via Supabase Realtime (the client subscribes).
  // We use the messages channel to send a custom event.
  const channel = admin.channel(`org:${body.orgId}:typing`);
  await channel.subscribe();
  await channel.send({
    type: "broadcast",
    event: "typing",
    payload: {
      conversationId: body.conversationId,
      userId: user.id,
      email: user.email,
      timestamp: Date.now(),
    },
  });
  admin.removeChannel(channel);

  return NextResponse.json({ ok: true });
}
