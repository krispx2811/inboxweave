import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * POST /api/push/subscribe — register a Web Push subscription.
 * Body: { orgId, subscription: PushSubscription }
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("unauthorized", { status: 401 });

  const body = (await req.json()) as {
    orgId?: string;
    subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  };

  if (!body.orgId || !body.subscription?.endpoint || !body.subscription.keys?.p256dh || !body.subscription.keys?.auth) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  await admin.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      org_id: body.orgId,
      endpoint: body.subscription.endpoint,
      p256dh: body.subscription.keys.p256dh,
      auth: body.subscription.keys.auth,
    },
    { onConflict: "endpoint" },
  );

  return NextResponse.json({ ok: true });
}
