import { NextResponse, type NextRequest } from "next/server";
import { requireOrgMember } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { bufferToPgBytea, encryptSecret } from "@/lib/crypto/secrets";

export const runtime = "nodejs";

const GRAPH = "https://graph.facebook.com/v21.0";

/**
 * Facebook Login redirect target. Exchanges the short-lived `code` for a
 * user access token, lists the pages they manage, and upserts one channel
 * row per page (Messenger). If a page has a linked Instagram Business
 * account, also upsert an IG channel row pointing at that IG account id.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code || !state) return NextResponse.redirect(new URL("/", req.url));

  let orgId: string;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as {
      orgId: string;
    };
    orgId = decoded.orgId;
  } catch {
    return new NextResponse("bad state", { status: 400 });
  }

  // Guard membership.
  await requireOrgMember(orgId);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inboxweave.com";
  const redirectUri = `${appUrl}/api/meta/oauth/callback`;
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return new NextResponse("server not configured", { status: 500 });

  // 1. Code → short-lived user token.
  const tokenRes = await fetch(
    `${GRAPH}/oauth/access_token?` +
      new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: redirectUri,
        code,
      }),
  );
  const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: { message: string } };
  if (!tokenRes.ok || !tokenJson.access_token) {
    return new NextResponse(`oauth failed: ${tokenJson.error?.message ?? "unknown"}`, { status: 400 });
  }

  // 2. List pages + per-page access tokens.
  const pagesRes = await fetch(
    `${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${encodeURIComponent(
      tokenJson.access_token,
    )}`,
  );
  const pagesJson = (await pagesRes.json()) as {
    data?: Array<{
      id: string;
      name: string;
      access_token: string;
      instagram_business_account?: { id: string };
    }>;
  };
  const pages = pagesJson.data ?? [];

  const admin = createSupabaseAdminClient();

  for (const page of pages) {
    const encrypted = bufferToPgBytea(encryptSecret(page.access_token));
    // Messenger channel for this page.
    await admin.from("channels").upsert(
      {
        org_id: orgId,
        platform: "messenger",
        external_id: page.id,
        display_name: page.name,
        access_token_ciphertext: encrypted,
        status: "active",
      },
      { onConflict: "external_id" },
    );
    // Instagram channel (uses the same page access token).
    if (page.instagram_business_account?.id) {
      await admin.from("channels").upsert(
        {
          org_id: orgId,
          platform: "instagram",
          external_id: page.instagram_business_account.id,
          display_name: `${page.name} (Instagram)`,
          access_token_ciphertext: encrypted,
          status: "active",
        },
        { onConflict: "external_id" },
      );
    }
    // Subscribe the page to the app's webhooks.
    await fetch(`${GRAPH}/${page.id}/subscribed_apps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscribed_fields: ["messages", "messaging_postbacks"],
        access_token: page.access_token,
      }),
    }).catch((err) => console.error("[meta oauth] subscribe failed", err));
  }

  return NextResponse.redirect(new URL(`/app/${orgId}/channels`, req.url));
}
