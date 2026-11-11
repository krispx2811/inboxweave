import { NextResponse, type NextRequest } from "next/server";
import { requireOrgMember } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, pgByteaToBuffer } from "@/lib/crypto/secrets";
import { hasCommentAccess, igSubscribedFields, scopesAfterSubscribe } from "@/lib/channels/ig-scopes";

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
    .select("external_id, access_token_ciphertext, granted_scopes")
    .eq("id", body.channelId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!channel) return NextResponse.json({ error: "channel not found" }, { status: 404 });

  const token = decryptSecret(pgByteaToBuffer(channel.access_token_ciphertext as unknown as string));
  const igUserId = channel.external_id as string;

  let writeError: string | undefined;
  const results: Array<{ host: string; status: number; body: string }> = [];
  // If the full set of fields is refused on both hosts, retry with "messages" only.
  const wantedFields = igSubscribedFields(channel.granted_scopes as string[] | null);
  const fieldAttempts = wantedFields === "messages" ? [wantedFields] : [wantedFields, "messages"];
  for (const fields of fieldAttempts) {
    for (const host of ["graph.instagram.com/v21.0", "graph.facebook.com/v21.0"]) {
      try {
        const url = new URL(`https://${host}/${igUserId}/subscribed_apps`);
        url.searchParams.set("subscribed_fields", fields);
        url.searchParams.set("access_token", token);
        const r = await fetch(url.toString(), { method: "POST" });
        const t = await r.text();
        results.push({ host, status: r.status, body: t.slice(0, 300) });
        if (r.ok) {
          // Comment access only counts if the comment fields were really subscribed.
          const granted = channel.granted_scopes as string[] | null;
          const scopes = scopesAfterSubscribe(granted, fields === wantedFields);
          const commentSubscribeFailed = hasCommentAccess(granted) && !hasCommentAccess(scopes);
          if (commentSubscribeFailed) {
            const { error: scopeErr } = await admin
              .from("channels")
              .update({ granted_scopes: scopes })
              .eq("id", body.channelId)
              .eq("org_id", orgId);
            const { error: offErr } = await admin
              .from("comment_dm_settings")
              .update({ enabled: false, updated_at: new Date().toISOString() })
              .eq("channel_id", body.channelId)
              .eq("org_id", orgId);
            writeError = scopeErr?.message ?? offErr?.message;
            if (writeError) console.error("[subscribe-ig] could not drop comment access:", writeError);
            await admin
              .from("audit_logs")
              .insert({
                org_id: orgId,
                action: "instagram_comment_subscribe_failed",
                payload: { channel_id: body.channelId },
              })
              .then(() => {});
          }
          return NextResponse.json({ ok: true, host, fields, result: t, commentSubscribeFailed, writeError });
        }
      } catch (err) {
        results.push({ host, status: 0, body: (err as Error).message });
      }
    }
  }
  return NextResponse.json({ ok: false, results }, { status: 500 });
}
