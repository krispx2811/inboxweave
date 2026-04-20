import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  bufferToPgBytea,
  decryptSecret,
  encryptSecret,
  pgByteaToBuffer,
} from "@/lib/crypto/secrets";
import { markChannelUnhealthy } from "@/lib/channels/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Refreshes long-lived access tokens for Instagram Business Login channels.
 * Call daily:
 *   GET /api/cron/refresh-tokens?key=<CRON_SECRET>
 *
 * Meta IG Business Login tokens are valid for 60 days. Calling the refresh
 * endpoint within that window resets the clock. This job refreshes any IG
 * channel that hasn't been refreshed in the last 30 days.
 *
 * Facebook Page tokens from the classic FB Login flow are effectively
 * permanent (derived from a long-lived user token) so we don't refresh them.
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (process.env.CRON_SECRET && key !== process.env.CRON_SECRET) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: channels } = await admin
    .from("channels")
    .select("id, org_id, platform, external_id, access_token_ciphertext, token_refreshed_at, created_at, status")
    .eq("platform", "instagram")
    .or(`token_refreshed_at.is.null,token_refreshed_at.lt.${thirtyDaysAgo}`);

  const results: Array<Record<string, unknown>> = [];

  for (const ch of channels ?? []) {
    const row: Record<string, unknown> = { channel_id: ch.id, org_id: ch.org_id };
    try {
      const token = decryptSecret(
        pgByteaToBuffer(ch.access_token_ciphertext as unknown as string),
      );
      // Only IG Business Login tokens can be refreshed this way.
      if (!token.startsWith("IGA")) {
        row.skipped = "not-ig-business-token";
        results.push(row);
        continue;
      }

      const url = new URL("https://graph.instagram.com/refresh_access_token");
      url.searchParams.set("grant_type", "ig_refresh_token");
      url.searchParams.set("access_token", token);

      const res = await fetch(url.toString());
      const text = await res.text();
      if (!res.ok) {
        row.ok = false;
        row.error = `${res.status}: ${text.slice(0, 200)}`;
        // If the token is already invalid, mark the channel and notify the owner.
        await markChannelUnhealthy({
          channelId: ch.id as string,
          orgId: ch.org_id as string,
          platform: "instagram",
          error: `Token refresh failed: ${text.slice(0, 200)}`,
        }).catch(() => {});
        results.push(row);
        continue;
      }

      const json = JSON.parse(text) as { access_token?: string; expires_in?: number };
      if (!json.access_token) {
        row.ok = false;
        row.error = "no access_token in refresh response";
        results.push(row);
        continue;
      }

      const cipher = encryptSecret(json.access_token);
      await admin
        .from("channels")
        .update({
          access_token_ciphertext: bufferToPgBytea(cipher),
          token_refreshed_at: new Date().toISOString(),
        })
        .eq("id", ch.id);

      row.ok = true;
      row.expires_in = json.expires_in;
      results.push(row);
    } catch (err) {
      row.ok = false;
      row.error = (err as Error).message;
      results.push(row);
    }
  }

  return NextResponse.json({
    checked: (channels ?? []).length,
    results,
  });
}
