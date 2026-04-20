import { NextResponse, type NextRequest } from "next/server";
import { requireOrgMember } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, pgByteaToBuffer } from "@/lib/crypto/secrets";

export const runtime = "nodejs";

/**
 * Subscribe an existing Instagram channel to webhooks without re-running
 * OAuth. Useful when a channel was connected before the subscribe call was
 * added to the OAuth flow.
 *
 * POST /app/[orgId]/channels/subscribe-ig
 * Body: { channelId }
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await ctx.params;
  const memberCtx = await requireOrgMember(orgId);
  if (memberCtx.role !== "owner") {
    return NextResponse.json({ error: "Only owners can subscribe channels" }, { status: 403 });
  }

  const body = (await req.json()) as { channelId?: string };
  if (!body.channelId) return NextResponse.json({ error: "missing channelId" }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: channel } = await admin
    .from("channels")
    .select("external_id, access_token_ciphertext")
    .eq("id", body.channelId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!channel) return NextResponse.json({ error: "channel not found" }, { status: 404 });

  const token = decryptSecret(pgByteaToBuffer(channel.access_token_ciphertext as unknown as string));
  const igUserId = channel.external_id as string;

  const results: Array<{ host: string; status: number; body: string }> = [];
  for (const host of ["graph.instagram.com/v21.0", "graph.facebook.com/v21.0"]) {
    try {
      const url = new URL(`https://${host}/${igUserId}/subscribed_apps`);
      url.searchParams.set("subscribed_fields", "messages");
      url.searchParams.set("access_token", token);
      const r = await fetch(url.toString(), { method: "POST" });
      const t = await r.text();
      results.push({ host, status: r.status, body: t.slice(0, 300) });
      if (r.ok) return NextResponse.json({ ok: true, host, result: t });
    } catch (err) {
      results.push({ host, status: 0, body: (err as Error).message });
    }
  }
  return NextResponse.json({ ok: false, results }, { status: 500 });
}
