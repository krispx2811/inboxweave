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
 * Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDesc = searchParams.get("error_description");

  if (error) {
    return new NextResponse(`Instagram returned error: ${error} — ${errorDesc}`, { status: 400 });
  }
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

  // 1. Short-lived token exchange.
  const shortBody = new URLSearchParams();
  shortBody.set("client_id", creds.appId);
  shortBody.set("client_secret", creds.appSecret);
  shortBody.set("grant_type", "authorization_code");
  shortBody.set("redirect_uri", redirectUri);
  shortBody.set("code", code);

  const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: shortBody.toString(),
  });
  const tokenText = await tokenRes.text();
  console.log("[ig oauth] short-lived status:", tokenRes.status, "body:", tokenText.slice(0, 300));

  let tokenJson: { access_token?: string; user_id?: number; error_message?: string; error_type?: string };
  try {
    tokenJson = JSON.parse(tokenText);
  } catch {
    return redirectBack(req, orgId, "error", `Step 1 (short-lived): ${tokenText.slice(0, 100)}`);
  }

  if (!tokenRes.ok || !tokenJson.access_token) {
    return redirectBack(req, orgId, "error", `Step 1 (short-lived): ${tokenJson.error_message ?? JSON.stringify(tokenJson).slice(0, 100)}`);
  }

  // 2. Long-lived token exchange (60 days).
  const longUrl = new URL("https://graph.instagram.com/access_token");
  longUrl.searchParams.set("grant_type", "ig_exchange_token");
  longUrl.searchParams.set("client_secret", creds.appSecret);
  longUrl.searchParams.set("access_token", tokenJson.access_token);
  const longRes = await fetch(longUrl.toString());
  const longText = await longRes.text();
  console.log("[ig oauth] long-lived status:", longRes.status, "body:", longText.slice(0, 300));

  let longLivedToken = tokenJson.access_token;
  try {
    const longJson = JSON.parse(longText) as { access_token?: string; error?: { message: string } };
    if (longJson.access_token) longLivedToken = longJson.access_token;
    else if (longJson.error) {
      return redirectBack(req, orgId, "error", `Step 2 (long-lived): ${longJson.error.message}`);
    }
  } catch {
    return redirectBack(req, orgId, "error", `Step 2 parse: ${longText.slice(0, 100)}`);
  }

  // 3. Fetch IG user info.
  const userUrl = new URL("https://graph.instagram.com/me");
  userUrl.searchParams.set("fields", "user_id,username,account_type");
  userUrl.searchParams.set("access_token", longLivedToken);
  const userRes = await fetch(userUrl.toString());
  const userText = await userRes.text();
  console.log("[ig oauth] /me status:", userRes.status, "body:", userText.slice(0, 300));

  let userJson: { user_id?: string; username?: string; account_type?: string; id?: string; error?: { message: string } };
  try {
    userJson = JSON.parse(userText);
  } catch {
    return redirectBack(req, orgId, "error", `Step 3 parse: ${userText.slice(0, 100)}`);
  }

  if (userJson.error) {
    return redirectBack(req, orgId, "error", `Step 3 (/me): ${userJson.error.message}`);
  }

  // Some responses use `id` instead of `user_id`.
  const igUserId = userJson.user_id ?? userJson.id;
  if (!igUserId) {
    return redirectBack(req, orgId, "error", `Step 3: no user_id in response: ${userText.slice(0, 100)}`);
  }

  // 4. Persist as an Instagram channel.
  const admin = createSupabaseAdminClient();
  const encrypted = bufferToPgBytea(encryptSecret(longLivedToken));
  const { error: upErr } = await admin.from("channels").upsert(
    {
      org_id: orgId,
      platform: "instagram",
      external_id: igUserId,
      display_name: userJson.username ?? "Instagram",
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
    payload: { username: userJson.username, user_id: igUserId },
  }).then(() => {});

  return redirectBack(req, orgId, "success", `@${userJson.username}`);
}
