import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { saveMetaSettings } from "./actions";
import { IconFacebook } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function MetaSettingsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const admin = createSupabaseAdminClient();
  const { data: settings } = await admin
    .from("meta_settings")
    .select("app_id, webhook_verify_token, updated_at")
    .eq("org_id", orgId)
    .maybeSingle();

  const configured = Boolean(settings?.app_id);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inboxweave.com";
  const webhookUrls = {
    whatsapp: `${appUrl}/api/webhooks/whatsapp`,
    messenger: `${appUrl}/api/webhooks/messenger`,
    instagram: `${appUrl}/api/webhooks/instagram`,
  };

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="page-header">
        <h1>Meta App Credentials</h1>
        <p>Connect your own Meta developer app to enable WhatsApp, Instagram, and Messenger</p>
      </div>

      <section className="card mb-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
            <IconFacebook className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h2 className="font-semibold">Your Meta App</h2>
            <p className="text-xs text-slate-500">
              {configured ? (
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                  Configured with App ID: <code className="font-mono">{settings!.app_id}</code>
                </span>
              ) : (
                "Paste your credentials from the Meta Developer dashboard"
              )}
            </p>
          </div>
        </div>

        <form action={saveMetaSettings} className="space-y-4">
          <input type="hidden" name="orgId" value={orgId} />
          <div>
            <label className="label">App ID</label>
            <input className="input" name="appId" defaultValue={(settings?.app_id as string) ?? ""} placeholder="e.g. 123456789012345" required />
            <p className="mt-1 text-[10px] text-slate-400">From Meta Developer dashboard → your app → Settings → Basic</p>
          </div>
          <div>
            <label className="label">App Secret</label>
            <input className="input" name="appSecret" type="password" placeholder="Paste new secret to save" required autoComplete="off" />
            <p className="mt-1 text-[10px] text-slate-400">Same page as App ID. Click &ldquo;Show&rdquo; next to App Secret. Encrypted on save.</p>
          </div>
          <div>
            <label className="label">Webhook Verify Token</label>
            <input className="input" name="verifyToken" defaultValue={(settings?.webhook_verify_token as string) ?? ""} placeholder="A random string you choose" required />
            <p className="mt-1 text-[10px] text-slate-400">Any random string (e.g. generated with <code>openssl rand -hex 16</code>). You&apos;ll use the same value in Meta&apos;s webhook setup.</p>
          </div>
          <button className="btn">Save Meta credentials</button>
        </form>
      </section>

      <section className="card">
        <h2 className="font-semibold mb-1">Setup steps</h2>
        <p className="text-xs text-slate-500 mb-4">Once you save your credentials above, configure these webhook URLs in the Meta Developer dashboard:</p>
        <div className="space-y-3">
          {[
            { label: "WhatsApp", url: webhookUrls.whatsapp, events: "messages" },
            { label: "Messenger", url: webhookUrls.messenger, events: "messages, messaging_postbacks" },
            { label: "Instagram", url: webhookUrls.instagram, events: "messages" },
          ].map(({ label, url, events }) => (
            <div key={label} className="rounded-lg bg-slate-50 p-3">
              <div className="text-sm font-semibold mb-1">{label}</div>
              <div className="text-[11px] text-slate-500">Callback URL:</div>
              <code className="block mt-0.5 text-[11px] font-mono text-slate-700 break-all">{url}</code>
              <div className="mt-1.5 text-[11px] text-slate-500">Subscribe to: <span className="text-slate-700">{events}</span></div>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-800">
          <strong>Tip:</strong> Use the same verify token you saved above when registering each webhook.
          See the <a href="/guides" className="underline">Setup Guides</a> for step-by-step instructions.
        </div>
      </section>
    </main>
  );
}
