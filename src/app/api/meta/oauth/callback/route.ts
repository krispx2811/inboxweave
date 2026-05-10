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
  let flow: "ig" | "fb" | "wa" = "fb";
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as {
      orgId: string;
      flow?: "ig" | "fb" | "wa";
    };
    orgId = decoded.orgId;
    if (decoded.flow === "ig") flow = "ig";
    else if (decoded.flow === "wa") flow = "wa";
  } catch {
    return new NextResponse("bad state", { status: 400 });
  }

  // If this callback was triggered by an Instagram Business Login, delegate
  // to the IG handler by forwarding the same query params. IMPORTANT: use
  // NEXT_PUBLIC_APP_URL as the base (not req.url) because Netlify's internal
  // routing surfaces the deploy-preview hostname in req.url even when the
  // user hit inboxweave.com — which would kick them to a hostname where
  // their session cookie doesn't exist.
  if (flow === "ig") {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    const forward = new URL("/api/meta/ig-oauth/callback", base);
    forward.search = new URL(req.url).search;
    return NextResponse.redirect(forward);
  }

  // WhatsApp via Facebook Login: exchange the code for a long-lived user
  // token, list the WABAs the user owns, and create a channel for each phone.
  if (flow === "wa") {
    return handleWhatsAppFlow(req, orgId, code);
  }

  await requireOrgMember(orgId);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inboxweave.com";
  const redirectUri = `${appUrl}/api/meta/oauth/callback`;

  // Prefer per-org Meta credentials; fall back to global env for backwards
  // compatibility with single-tenant deployments.
  const orgCreds = await getMetaCredentials(orgId, "fb");
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

/**
 * WhatsApp via Facebook Login (Option B). Exchange code → user token,
 * find WABAs the user owns, list phone numbers, upsert one channel per
 * phone, and subscribe each WABA to our webhook.
 */
async function handleWhatsAppFlow(req: NextRequest, orgId: string, code: string) {
  await requireOrgMember(orgId);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inboxweave.com";
  const redirectUri = `${appUrl}/api/meta/oauth/callback`;
  const orgCreds = await getMetaCredentials(orgId, "fb");
  const appId = orgCreds?.appId ?? process.env.META_APP_ID;
  const appSecret = orgCreds?.appSecret ?? process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return redirectBack(req, orgId, "error", "Meta app credentials not configured.");
  }

  // 1. Exchange code → user token.
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
  if (!tokenJson.access_token) {
    return redirectBack(req, orgId, "error", tokenJson.error?.message ?? "WA token exchange failed");
  }
  const userToken = tokenJson.access_token;

  // 2. List businesses the user owns + the WABAs under each.
  const bizRes = await fetch(
    `${GRAPH}/me/businesses?fields=id,name,owned_whatsapp_business_accounts{id,name,phone_numbers{id,display_phone_number,verified_name}}&access_token=${encodeURIComponent(userToken)}`,
  );
  const bizJson = (await bizRes.json()) as {
    data?: Array<{
      id: string;
      owned_whatsapp_business_accounts?: {
        data?: Array<{
          id: string;
          name?: string;
          phone_numbers?: {
            data?: Array<{ id: string; display_phone_number: string; verified_name: string }>;
          };
        }>;
      };
    }>;
    error?: { message: string };
  };
  if (bizJson.error) {
    return redirectBack(req, orgId, "error", bizJson.error.message);
  }

  const admin = createSupabaseAdminClient();
  let phoneCount = 0;
  const wabas: string[] = [];

  for (const biz of bizJson.data ?? []) {
    for (const waba of biz.owned_whatsapp_business_accounts?.data ?? []) {
      wabas.push(waba.id);
      // Subscribe this WABA to our webhook.
      await fetch(
        `${GRAPH}/${waba.id}/subscribed_apps?access_token=${encodeURIComponent(userToken)}`,
        { method: "POST" },
      ).catch(() => {});

      for (const phone of waba.phone_numbers?.data ?? []) {
        const cipher = bufferToPgBytea(encryptSecret(userToken));
        await admin.from("channels").upsert(
          {
            org_id: orgId,
            platform: "whatsapp",
            external_id: phone.id,
            display_name: phone.verified_name || phone.display_phone_number,
            access_token_ciphertext: cipher,
            status: "active",
          },
          { onConflict: "external_id" },
        );
        phoneCount++;
      }
    }
  }

  if (phoneCount === 0) {
    return redirectBack(
      req,
      orgId,
      "error",
      "No WhatsApp phone numbers found on your account. Make sure you have at least one verified phone in WhatsApp Manager.",
    );
  }

  await admin.from("audit_logs").insert({
    org_id: orgId,
    action: "channel_connected",
    payload: { platform: "whatsapp", method: "fb_login", wabas, phones: phoneCount },
  });

  return redirectBack(
    req,
    orgId,
    "success",
    `WhatsApp · ${phoneCount} phone${phoneCount === 1 ? "" : "s"}`,
  );
}
