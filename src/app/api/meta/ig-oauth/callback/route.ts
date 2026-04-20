import { NextResponse, type NextRequest } from "next/server";
import { requireOrgMember } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { bufferToPgBytea, encryptSecret } from "@/lib/crypto/secrets";
import { getMetaCredentials } from "@/lib/channels/meta-settings";

export const runtime = "nodejs";

const IG = "https://api.instagram.com";
const GRAPH = "https://graph.instagram.com/v21.0";

function redirectBack(req: NextRequest, orgId: string, status: string, detail?: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const url = new URL(`/app/${orgId}/channels`, base);
  url.searchParams.set("ig", status);
  if (detail) url.searchParams.set("msg", detail);
  return NextResponse.redirect(url);
}

/**
 * Instagram Business Login OAuth callback.
 * Uses the NEW Instagram API (not the classic Facebook Login flow).
 *
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

  // 1. Short-lived token.
  const tokenRes = await fetch(`${IG}/oauth/access_token`, {
    method: "POST",
    body: new URLSearchParams({
      client_id: creds.appId,
      client_secret: creds.appSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    }),
  });
  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    user_id?: number;
    permissions?: string[];
    error_type?: string;
    error_message?: string;
  };
  if (!tokenRes.ok || !tokenJson.access_token) {
    console.error("[ig oauth] short-lived token failed", tokenJson);
    return redirectBack(req, orgId, "error", tokenJson.error_message ?? "token exchange failed");
  }

  // 2. Exchange for long-lived token (60 days).
  // Note: the long-lived exchange endpoint does NOT take a version segment.
  const longRes = await fetch(
    `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(
      creds.appSecret,
    )}&access_token=${encodeURIComponent(tokenJson.access_token)}`,
  );
  const longJson = (await longRes.json()) as { access_token?: string; error?: { message: string } };
  if (longJson.error) {
    console.error("[ig oauth] long-lived exchange failed", longJson.error);
  }
  const longLivedToken = longJson.access_token ?? tokenJson.access_token;

  // 3. Fetch IG user info (no API version in the /me path either).
  const userRes = await fetch(
    `https://graph.instagram.com/me?fields=user_id,username,account_type&access_token=${encodeURIComponent(longLivedToken)}`,
  );
  const userJson = (await userRes.json()) as {
    user_id?: string;
    username?: string;
    account_type?: string;
    error?: { message: string };
  };
  if (userJson.error || !userJson.user_id) {
    console.error("[ig oauth] user info failed", userJson);
    return redirectBack(req, orgId, "error", userJson.error?.message ?? "user info failed");
  }

  // 4. Persist as an Instagram channel.
  const admin = createSupabaseAdminClient();
  const encrypted = bufferToPgBytea(encryptSecret(longLivedToken));
  const { error: upErr } = await admin.from("channels").upsert(
    {
      org_id: orgId,
      platform: "instagram",
      external_id: userJson.user_id,
      display_name: userJson.username ?? "Instagram",
      access_token_ciphertext: encrypted,
      status: "active",
    },
    { onConflict: "external_id" },
  );
  if (upErr) {
    console.error("[ig oauth] channel upsert failed", upErr);
    return redirectBack(req, orgId, "error", upErr.message);
  }

  await admin.from("audit_logs").insert({
    org_id: orgId,
    action: "instagram_connected",
    payload: { username: userJson.username, user_id: userJson.user_id },
  }).then(() => {});

  return redirectBack(req, orgId, "success", `@${userJson.username}`);
}
