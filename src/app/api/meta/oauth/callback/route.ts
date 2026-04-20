import { NextResponse, type NextRequest } from "next/server";
import { requireOrgMember } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { bufferToPgBytea, encryptSecret } from "@/lib/crypto/secrets";
import { getMetaCredentials } from "@/lib/channels/meta-settings";

export const runtime = "nodejs";

const GRAPH = "https://graph.facebook.com/v21.0";

function redirectBack(req: NextRequest, orgId: string, status: string, detail?: string) {
  // Prefer the configured public app URL so we always land on the primary
  // domain (e.g. inboxweave.com) even when the request came in via a Netlify
  // preview URL.
  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const url = new URL(`/app/${orgId}/channels`, base);
  url.searchParams.set("fb", status);
  if (detail) url.searchParams.set("msg", detail);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDesc = searchParams.get("error_description");

  if (error) {
    return new NextResponse(`Facebook returned error: ${error} — ${errorDesc}`, { status: 400 });
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
  const redirectUri = `${appUrl}/api/meta/oauth/callback`;

  // Prefer per-org Meta credentials; fall back to global env for backwards
  // compatibility with single-tenant deployments.
  const orgCreds = await getMetaCredentials(orgId);
  const appId = orgCreds?.appId ?? process.env.META_APP_ID;
  const appSecret = orgCreds?.appSecret ?? process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return redirectBack(req, orgId, "error", "Meta app credentials not configured. Go to Settings → Meta App.");
  }

  // 1. Code → user access token.
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
    console.error("[meta oauth] token exchange failed", tokenJson);
    return redirectBack(req, orgId, "error", tokenJson.error?.message ?? "token exchange failed");
  }

  // 2. List pages.
  const pagesRes = await fetch(
    `${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${encodeURIComponent(
      tokenJson.access_token,
    )}`,
  );
  const pagesJson = (await pagesRes.json()) as {
    data?: Array<{ id: string; name: string; access_token: string; instagram_business_account?: { id: string } }>;
    error?: { message: string };
  };
  if (pagesJson.error) {
    console.error("[meta oauth] pages fetch failed", pagesJson.error);
    return redirectBack(req, orgId, "error", pagesJson.error.message);
  }
  const pages = pagesJson.data ?? [];

  if (pages.length === 0) {
    return redirectBack(req, orgId, "no_pages");
  }

  const admin = createSupabaseAdminClient();
  let connectedCount = 0;
  let igCount = 0;

  for (const page of pages) {
    try {
      const encrypted = bufferToPgBytea(encryptSecret(page.access_token));
      const { error: upErr } = await admin.from("channels").upsert(
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
      if (upErr) {
        console.error("[meta oauth] channel upsert failed", upErr);
        continue;
      }
      connectedCount++;

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
        igCount++;
      }

      await fetch(`${GRAPH}/${page.id}/subscribed_apps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscribed_fields: ["messages", "messaging_postbacks"],
          access_token: page.access_token,
        }),
      }).catch((err) => console.error("[meta oauth] subscribe failed", err));
    } catch (err) {
      console.error("[meta oauth] unexpected error for page", page.id, err);
    }
  }

  await admin.from("audit_logs").insert({
    org_id: orgId,
    action: "facebook_connected",
    payload: { pages: connectedCount, instagram: igCount },
  }).then(() => {});

  return redirectBack(req, orgId, "success", `${connectedCount} page${connectedCount === 1 ? "" : "s"}, ${igCount} Instagram`);
}
