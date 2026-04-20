import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { saveFacebookCreds, saveInstagramCreds, saveVerifyToken } from "./actions";
import { IconFacebook, IconInstagram } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function MetaSettingsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;

  interface MetaRow {
    ig_app_id: string | null;
    fb_app_id: string | null;
    webhook_verify_token: string | null;
    updated_at: string | null;
  }
  let settings: MetaRow | null = null;
  let dbError: string | null = null;
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("meta_settings")
      .select("ig_app_id, fb_app_id, webhook_verify_token, updated_at")
      .eq("org_id", orgId)
      .maybeSingle();
    if (error) dbError = error.message;
    else settings = (data as unknown as MetaRow) ?? null;
  } catch (err) {
    dbError = (err as Error).message;
  }

  const secretsKeyMissing = !process.env.SECRETS_ENCRYPTION_KEY;
  const igConfigured = Boolean(settings?.ig_app_id);
  const fbConfigured = Boolean(settings?.fb_app_id);
  const verifyTokenSet = Boolean(settings?.webhook_verify_token);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inboxweave.com";

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="page-header">
        <h1>Meta App Credentials</h1>
        <p>Instagram and Facebook/Messenger/WhatsApp use different app IDs. Configure whichever you need.</p>
      </div>

      {dbError && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Database error:</strong> {dbError}
        </div>
      )}
      {secretsKeyMissing && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Encryption key not set.</strong> Set <code>SECRETS_ENCRYPTION_KEY</code> in your env.
        </div>
      )}

      {/* ── Shared verify token ─────────────────────────────── */}
      <section className="card mb-6">
        <h2 className="font-semibold mb-1">Webhook Verify Token</h2>
        <p className="text-xs text-slate-500 mb-4">
          Any random string. Use the same value in every Meta webhook you register below.
          {verifyTokenSet && <span className="ml-1 text-emerald-600">✓ set</span>}
        </p>
        <form action={saveVerifyToken} className="flex gap-2">
          <input type="hidden" name="orgId" value={orgId} />
          <input
            className="input flex-1"
            name="verifyToken"
            defaultValue={settings?.webhook_verify_token ?? ""}
            placeholder="e.g. openssl rand -hex 16"
            required
          />
          <button className="btn" type="submit" disabled={secretsKeyMissing}>Save</button>
        </form>
      </section>

      {/* ── Instagram Business Login creds ─────────────────── */}
      <section className="card mb-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-100">
            <IconInstagram className="h-5 w-5 text-pink-600" />
          </div>
          <div>
            <h2 className="font-semibold">Instagram Business Login</h2>
            <p className="text-xs text-slate-500">
              {igConfigured ? (
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                  Configured: <code className="font-mono">{settings!.ig_app_id}</code>
                </span>
              ) : (
                "Instagram app ID + secret (from Meta dashboard → your app → Instagram → API setup)"
              )}
            </p>
          </div>
        </div>
        <form action={saveInstagramCreds} className="space-y-4">
          <input type="hidden" name="orgId" value={orgId} />
          <div>
            <label className="label">Instagram App ID</label>
            <input className="input" name="igAppId" defaultValue={settings?.ig_app_id ?? ""} placeholder="e.g. 971510478670500" required />
          </div>
          <div>
            <label className="label">Instagram App Secret</label>
            <input className="input" name="igAppSecret" type="password" placeholder="Paste to save (encrypted)" required autoComplete="off" />
          </div>
          <button className="btn" disabled={secretsKeyMissing}>Save Instagram credentials</button>
        </form>
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-[11px] text-slate-600">
          <div className="font-semibold">Webhook setup in Meta:</div>
          <div>Callback: <code className="font-mono break-all">{appUrl}/api/webhooks/instagram</code></div>
          <div>OAuth redirect: <code className="font-mono break-all">{appUrl}/api/meta/ig-oauth/callback</code></div>
          <div>Subscribe to: <strong>messages</strong></div>
        </div>
      </section>

      {/* ── Facebook / Messenger / WhatsApp creds ──────────── */}
      <section className="card mb-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
            <IconFacebook className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h2 className="font-semibold">Facebook, Messenger & WhatsApp</h2>
            <p className="text-xs text-slate-500">
              {fbConfigured ? (
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                  Configured: <code className="font-mono">{settings!.fb_app_id}</code>
                </span>
              ) : (
                "Meta app ID + secret (from Meta dashboard → App Settings → Basic)"
              )}
            </p>
          </div>
        </div>
        <form action={saveFacebookCreds} className="space-y-4">
          <input type="hidden" name="orgId" value={orgId} />
          <div>
            <label className="label">Meta App ID</label>
            <input className="input" name="fbAppId" defaultValue={settings?.fb_app_id ?? ""} placeholder="e.g. 1468866668112411" required />
          </div>
          <div>
            <label className="label">Meta App Secret</label>
            <input className="input" name="fbAppSecret" type="password" placeholder="Paste to save (encrypted)" required autoComplete="off" />
          </div>
          <button className="btn" disabled={secretsKeyMissing}>Save Meta credentials</button>
        </form>
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-[11px] text-slate-600">
          <div className="font-semibold">Webhook setup in Meta:</div>
          <div>Messenger: <code className="font-mono break-all">{appUrl}/api/webhooks/messenger</code></div>
          <div>WhatsApp: <code className="font-mono break-all">{appUrl}/api/webhooks/whatsapp</code></div>
          <div>OAuth redirect: <code className="font-mono break-all">{appUrl}/api/meta/oauth/callback</code></div>
        </div>
      </section>
    </main>
  );
}
