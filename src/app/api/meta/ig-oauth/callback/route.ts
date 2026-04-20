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
  // IMPORTANT: This MUST match the redirect_uri that was used in the original
  // OAuth authorize URL (built in channels/page.tsx). Meta verifies they are
  // byte-for-byte identical when exchanging the code for a token.
  // The /oauth/callback route dispatches to this handler when state.flow=ig.
  const redirectUri = `${appUrl}/api/meta/oauth/callback`;

  const creds = await getMetaCredentials(orgId, "ig");
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

  // NOTE: tokenJson.user_id is the "app-scoped" IG user ID (~16 digits).
  // But webhook events use the canonical Instagram Business user ID (~17
  // digits, e.g. 17841...). We fetch the canonical ID from /me below and
  // use THAT as the channel external_id so webhooks route correctly.
  let igUserId = String(tokenJson.user_id);
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

  // ── Step 3: fetch canonical user_id + username from /me.
  // The token-exchange response returns an app-scoped ID; webhooks use the
  // canonical IG Business user ID which we get here. Override igUserId.
  let username: string | undefined;
  try {
    const u = new URL("https://graph.instagram.com/v21.0/me");
    u.searchParams.set("fields", "user_id,username,name,profile_picture_url");
    u.searchParams.set("access_token", accessToken);
    const r = await fetch(u.toString());
    const t = await r.text();
    console.log("[ig oauth] /me fetch", r.status, t.slice(0, 250));
    const j = JSON.parse(t) as { user_id?: string; username?: string };
    if (j.user_id) igUserId = String(j.user_id);
    if (j.username) username = j.username;
  } catch (err) {
    console.log("[ig oauth] /me threw:", (err as Error).message);
  }

  // ── Step 4: subscribe this IG account to the app's webhooks ────────
  // Without this, Meta won't deliver message webhooks for this account even
  // if the webhook URL + verify token + messages field are all configured.
  let subscribeInfo = "";
  for (const host of ["graph.instagram.com/v21.0", "graph.facebook.com/v21.0"]) {
    try {
      const subUrl = new URL(`https://${host}/${igUserId}/subscribed_apps`);
      subUrl.searchParams.set("subscribed_fields", "messages");
      subUrl.searchParams.set("access_token", accessToken);
      const subRes = await fetch(subUrl.toString(), { method: "POST" });
      const subText = await subRes.text();
      console.log(`[ig oauth] subscribe (${host}):`, subRes.status, subText.slice(0, 200));
      if (subRes.ok) {
        subscribeInfo = ` — subscribed via ${host}`;
        break;
      } else {
        subscribeInfo = ` — subscribe failed: ${subText.slice(0, 80)}`;
      }
    } catch (err) {
      console.log(`[ig oauth] subscribe (${host}) threw:`, (err as Error).message);
    }
  }

  // ── Step 5: persist channel ─────────────────────────────────────────
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
    return redirectBack(req, orgId, "error", `Step 5 (DB): ${upErr.message}`);
  }

  await admin.from("audit_logs").insert({
    org_id: orgId,
    action: "instagram_connected",
    payload: { username: username ?? null, user_id: igUserId },
  }).then(() => {});

  return redirectBack(req, orgId, "success", username ? `@${username}` : `user ${igUserId}`);
}
