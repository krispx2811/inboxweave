import { NextResponse, type NextRequest } from "next/server";
import { requireOrgMember } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { bufferToPgBytea, encryptSecret } from "@/lib/crypto/secrets";
import { getMetaCredentials } from "@/lib/channels/meta-settings";

export const runtime = "nodejs";

function redirectBack(req: NextRequest, orgId: string, status: string, detail?: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const url = new URL(`/app/${orgId}/channels`, base);
  url.searchParams.set("ig", status);
  if (detail) url.searchParams.set("msg", detail);
  return NextResponse.redirect(url);
}

/**
 * Instagram Business Login OAuth callback.
 *
 * Flow:
 *  1. POST https://api.instagram.com/oauth/access_token
 *     → returns { access_token, user_id, permissions } (short-lived, ~1h)
 *  2. (Best-effort) exchange for long-lived token (60d).
 *  3. Store the channel. We already have user_id from step 1 so no /me call
 *     is needed — which is good because graph.instagram.com/me rejects GET
 *     on some accounts.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDesc = searchParams.get("error_description");

  if (error) return new NextResponse(`Instagram error: ${error} — ${errorDesc}`, { status: 400 });
  if (!code || !state) return NextResponse.redirect(new URL("/", req.url));

  let orgId: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as { orgId: string };
    orgId = decoded.orgId;
  } catch {
    return new NextResponse("bad state", { status: 400 });
  }

  await requireOrgMember(orgId);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inboxweave.com";
  const redirectUri = `${appUrl}/api/meta/ig-oauth/callback`;

  const creds = await getMetaCredentials(orgId);
  if (!creds) {
    return redirectBack(req, orgId, "error", "Meta app credentials not configured");
  }

  // ── Step 1: short-lived token exchange ────────────────────────────
  const shortBody = new URLSearchParams({
    client_id: creds.appId,
    client_secret: creds.appSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });

  const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: shortBody.toString(),
  });
  const tokenText = await tokenRes.text();
  console.log("[ig oauth] short-lived status:", tokenRes.status, "body:", tokenText.slice(0, 300));

  let tokenJson: {
    access_token?: string;
    user_id?: number | string;
    permissions?: string[];
    error_message?: string;
    error_type?: string;
  };
  try {
    tokenJson = JSON.parse(tokenText);
  } catch {
    return redirectBack(req, orgId, "error", `Step 1 parse: ${tokenText.slice(0, 100)}`);
  }

  if (!tokenRes.ok || !tokenJson.access_token) {
    return redirectBack(req, orgId, "error", `Step 1: ${tokenJson.error_message ?? JSON.stringify(tokenJson).slice(0, 100)}`);
  }
  if (!tokenJson.user_id) {
    return redirectBack(req, orgId, "error", `Step 1: no user_id in response`);
  }

  const igUserId = String(tokenJson.user_id);
  let accessToken = tokenJson.access_token;

  // ── Step 2: long-lived exchange (best-effort, not fatal) ──────────
  for (const host of ["graph.instagram.com", "graph.facebook.com"]) {
    try {
      const longUrl = new URL(`https://${host}/access_token`);
      longUrl.searchParams.set("grant_type", "ig_exchange_token");
      longUrl.searchParams.set("client_secret", creds.appSecret);
      longUrl.searchParams.set("access_token", accessToken);
      const longRes = await fetch(longUrl.toString());
      const longText = await longRes.text();
      console.log(`[ig oauth] long-lived (${host}):`, longRes.status, longText.slice(0, 150));
      const longJson = JSON.parse(longText) as { access_token?: string };
      if (longJson.access_token) { accessToken = longJson.access_token; break; }
    } catch (err) {
      console.log(`[ig oauth] long-lived (${host}) threw:`, (err as Error).message);
    }
  }

  // ── Step 3: best-effort fetch username so the channel has a nice label.
  // Failures here don't block the connection.
  let username: string | undefined;
  for (const base of [
    `https://graph.instagram.com/${igUserId}`,
    `https://graph.facebook.com/${igUserId}`,
    `https://graph.instagram.com/v21.0/${igUserId}`,
  ]) {
    try {
      const u = new URL(base);
      u.searchParams.set("fields", "username");
      u.searchParams.set("access_token", accessToken);
      const r = await fetch(u.toString());
      const t = await r.text();
      console.log("[ig oauth] username fetch", base, r.status, t.slice(0, 150));
      const j = JSON.parse(t) as { username?: string };
      if (j.username) { username = j.username; break; }
    } catch {
      /* ignore */
    }
  }

  // ── Step 4: persist channel ─────────────────────────────────────────
  const admin = createSupabaseAdminClient();
  const encrypted = bufferToPgBytea(encryptSecret(accessToken));
  const { error: upErr } = await admin.from("channels").upsert(
    {
      org_id: orgId,
      platform: "instagram",
      external_id: igUserId,
      display_name: username ?? `Instagram (${igUserId})`,
      access_token_ciphertext: encrypted,
      status: "active",
    },
    { onConflict: "external_id" },
  );
  if (upErr) {
    return redirectBack(req, orgId, "error", `Step 4 (DB): ${upErr.message}`);
  }

  await admin.from("audit_logs").insert({
    org_id: orgId,
    action: "instagram_connected",
    payload: { username: username ?? null, user_id: igUserId },
  }).then(() => {});

  return redirectBack(req, orgId, "success", username ? `@${username}` : `user ${igUserId}`);
}
