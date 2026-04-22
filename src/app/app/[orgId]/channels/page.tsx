import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  connectWhatsApp,
  disconnectChannel,
  scanIgRequestsNow,
  toggleAutoAcceptRequests,
} from "./actions";
import { IconWhatsApp, IconFacebook, IconChannels, IconTrash } from "@/components/icons";
import { ConfirmForm } from "@/components/ConfirmForm";

export const dynamic = "force-dynamic";

function statusBadge(status: string) {
  switch (status) {
    case "active": return "badge-green";
    case "paused": return "badge-amber";
    case "error":  return "badge-red";
    default:       return "badge-gray";
  }
}

function platformIcon(platform: string) {
  switch (platform) {
    case "whatsapp":  return <IconWhatsApp className="h-5 w-5 text-emerald-500" />;
    case "messenger": return <IconFacebook className="h-5 w-5 text-blue-600" />;
    case "instagram": return <span className="text-pink-500 font-bold text-sm">IG</span>;
    default:          return <IconChannels className="h-5 w-5" />;
  }
}

export default async function ChannelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ fb?: string; ig?: string; msg?: string }>;
}) {
  const { orgId } = await params;
  const { fb, ig, msg } = await searchParams;
  const admin = createSupabaseAdminClient();
  const { data: channels } = await admin
    .from("channels")
    .select("id, platform, external_id, display_name, status, last_error, last_error_at, auto_accept_requests, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  const brokenChannels = (channels ?? []).filter((c) => c.status === "error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inboxweave.com";

  // Read per-org app IDs (separate for Instagram vs Facebook).
  const { data: metaSettings } = await admin
    .from("meta_settings")
    .select("app_id, fb_app_id, ig_app_id")
    .eq("org_id", orgId)
    .maybeSingle();
  const fbAppId =
    (metaSettings?.fb_app_id as string | undefined) ??
    (metaSettings?.app_id as string | undefined) ??
    process.env.META_APP_ID;
  const igAppId =
    (metaSettings?.ig_app_id as string | undefined) ??
    (metaSettings?.app_id as string | undefined) ??
    process.env.META_APP_ID;
  const fbState = Buffer.from(JSON.stringify({ orgId, flow: "fb" })).toString("base64url");
  const igState = Buffer.from(JSON.stringify({ orgId, flow: "ig" })).toString("base64url");

  // Classic Facebook Login — for Messenger + Pages (requires Facebook Login product).
  const fbLoginUrl =
    fbAppId &&
    `https://www.facebook.com/v21.0/dialog/oauth?` +
      new URLSearchParams({
        client_id: fbAppId,
        redirect_uri: `${appUrl}/api/meta/oauth/callback`,
        state: fbState,
        scope: "pages_show_list,pages_messaging,pages_manage_metadata,instagram_basic,instagram_manage_messages",
      }).toString();

  // Instagram Business Login — reuses /api/meta/oauth/callback which
  // dispatches to the IG handler when state.flow === "ig".
  const igLoginUrl =
    igAppId &&
    `https://www.instagram.com/oauth/authorize?` +
      new URLSearchParams({
        enable_fb_login: "0",
        force_authentication: "1",
        client_id: igAppId,
        redirect_uri: `${appUrl}/api/meta/oauth/callback`,
        response_type: "code",
        scope: "instagram_business_basic,instagram_business_manage_messages",
        state: igState,
      }).toString();

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="page-header">
        <h1>Channels</h1>
        <p>Connect your messaging platforms</p>
      </div>

      {fb === "success" && (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <strong>Connected successfully.</strong> {msg ? `Linked ${msg}.` : ""}
        </div>
      )}
      {fb === "no_pages" && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>No Facebook Pages found.</strong> You need to create a Facebook Page first (or grant AI Inbox permission to manage one).
          Then retry the &ldquo;Connect with Facebook&rdquo; button.
        </div>
      )}
      {fb === "error" && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Connection failed.</strong> {msg ?? "Unknown error."} Try again or check the server logs.
        </div>
      )}
      {ig === "success" && (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <strong>Instagram connected.</strong> {msg ? `Linked ${msg}.` : ""}
        </div>
      )}
      {ig === "error" && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Instagram connection failed.</strong> {msg ?? "Unknown error."}
        </div>
      )}

      {brokenChannels.length > 0 && (
        <div className="mb-6 rounded-lg border border-red-300 bg-red-50 px-5 py-4 text-sm text-red-900">
          <div className="font-semibold mb-1">
            {brokenChannels.length === 1
              ? "1 channel needs reconnection"
              : `${brokenChannels.length} channels need reconnection`}
          </div>
          <p className="text-red-800 mb-3">
            The access token has been invalidated by Meta (usually after a password change).
            The AI cannot send replies on this channel until you reconnect it.
          </p>
          <ul className="space-y-1.5 text-xs text-red-800">
            {brokenChannels.map((c) => (
              <li key={c.id}>
                <strong>{c.display_name ?? c.external_id}</strong>
                {" — "}
                <span className="font-mono">{(c.last_error as string | null)?.slice(0, 140) ?? "token invalid"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── WhatsApp ────────────────────────────────────────── */}
      <section className="card mb-4">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
            <IconWhatsApp className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="font-semibold">WhatsApp Cloud API</h2>
            <p className="text-xs text-slate-500">Connect your business phone number</p>
          </div>
        </div>
        <form action={connectWhatsApp} className="space-y-4">
          <input type="hidden" name="orgId" value={orgId} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="displayName">Display name</label>
              <input className="input" id="displayName" name="displayName" placeholder="e.g. Support Line" required />
            </div>
            <div>
              <label className="label" htmlFor="phoneNumberId">Phone Number ID</label>
              <input className="input" id="phoneNumberId" name="phoneNumberId" placeholder="From Meta Business" required />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="accessToken">Permanent access token</label>
            <input className="input" id="accessToken" name="accessToken" type="password" placeholder="System user token from Meta Business Manager" required autoComplete="off" />
          </div>
          <div className="flex items-center justify-between">
            <button className="btn">
              <IconWhatsApp className="h-4 w-4" /> Connect WhatsApp
            </button>
            <p className="text-[10px] text-slate-400">
              Webhook URL: <code className="text-[10px]">{appUrl}/api/webhooks/whatsapp</code>
            </p>
          </div>
        </form>
      </section>

      {/* ── Instagram Business Login (new API) ──────────────── */}
      <section className="card mb-4">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-100">
            <span className="font-bold text-pink-600 text-sm">IG</span>
          </div>
          <div>
            <h2 className="font-semibold">Instagram Business Login</h2>
            <p className="text-xs text-slate-500">For Instagram Business/Creator accounts (no Facebook Page required)</p>
          </div>
        </div>
        {igLoginUrl ? (
          <a className="btn" href={igLoginUrl}>
            <span className="font-bold">IG</span> Connect Instagram
          </a>
        ) : (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            <strong>Meta app not configured.</strong> <a href={`/app/${orgId}/settings/meta`} className="underline font-semibold">Add your Meta app credentials</a> first.
          </div>
        )}
        <p className="mt-3 text-[10px] text-slate-400">
          Requires <code>instagram_business_basic</code> + <code>instagram_business_manage_messages</code> permissions in your Meta app.
        </p>
      </section>

      {/* ── Facebook Login (for Messenger + Pages) ──────────── */}
      <section className="card mb-8">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
            <IconFacebook className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h2 className="font-semibold">Facebook Messenger</h2>
            <p className="text-xs text-slate-500">Connect Facebook Pages (optionally with linked Instagram)</p>
          </div>
        </div>
        {fbLoginUrl ? (
          <a className="btn" href={fbLoginUrl}>
            <IconFacebook className="h-4 w-4" /> Connect with Facebook
          </a>
        ) : (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            <strong>Meta app not configured.</strong> <a href={`/app/${orgId}/settings/meta`} className="underline font-semibold">Add your Meta app credentials</a> first.
          </div>
        )}
        <p className="mt-3 text-[10px] text-slate-400">
          Requires the Facebook Login product in your Meta app with <code>pages_messaging</code> permission.
        </p>
      </section>

      {/* ── Connected channels ──────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-sm font-semibold text-slate-500 uppercase tracking-wider">
          Connected channels ({channels?.length ?? 0})
        </h2>
        <div className="space-y-2">
          {(channels ?? []).map((c) => (
            <div key={c.id} className="card">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-50">
                  {platformIcon(c.platform as string)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{c.display_name ?? c.external_id}</div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>{c.external_id}</span>
                    <span className={statusBadge(c.status as string)}>{c.status}</span>
                  </div>
                </div>
                <ConfirmForm
                  action={disconnectChannel}
                  confirm={`Remove channel "${c.display_name ?? c.external_id}"? Customers won't reach the AI on this channel until reconnected.`}
                >
                  <input type="hidden" name="orgId" value={orgId} />
                  <input type="hidden" name="channelId" value={c.id} />
                  <button className="btn-ghost btn-sm text-red-600 hover:bg-red-50 hover:border-red-200" type="submit">
                    <IconTrash className="h-4 w-4" /> Remove
                  </button>
                </ConfirmForm>
              </div>
              {c.platform === "instagram" && (
                <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs space-y-2">
                  <form
                    action={toggleAutoAcceptRequests}
                    className="flex items-center justify-between"
                  >
                    <input type="hidden" name="orgId" value={orgId} />
                    <input type="hidden" name="channelId" value={c.id} />
                    <input
                      type="hidden"
                      name="enabled"
                      value={c.auto_accept_requests ? "" : "true"}
                    />
                    <div>
                      <div className="font-semibold text-slate-700">Auto-accept message requests</div>
                      <div className="text-[10px] text-slate-500">
                        When ON, messages from non-followers (Requests folder) are answered
                        automatically whenever any IG activity comes in.
                      </div>
                    </div>
                    <button
                      className={`btn-sm ${c.auto_accept_requests ? "btn" : "btn-ghost"}`}
                      type="submit"
                    >
                      {c.auto_accept_requests ? "ON" : "OFF"}
                    </button>
                  </form>
                  <form action={scanIgRequestsNow} className="flex items-center justify-between border-t border-slate-200 pt-2">
                    <input type="hidden" name="orgId" value={orgId} />
                    <input type="hidden" name="channelId" value={c.id} />
                    <div className="text-[10px] text-slate-500">
                      Scan the Requests folder right now and process any pending messages.
                    </div>
                    <button className="btn-ghost btn-sm" type="submit">Scan requests now</button>
                  </form>
                </div>
              )}
            </div>
          ))}
          {channels?.length === 0 && (
            <div className="card text-center py-12">
              <IconChannels className="mx-auto h-8 w-8 text-slate-200" />
              <p className="mt-3 text-sm text-slate-400">No channels connected yet</p>
              <p className="mt-1 text-xs text-slate-400">Use the forms above to connect a platform</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
