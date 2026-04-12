import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { saveEmailSettings } from "./actions";
import { IconShield } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function EmailChannelPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const admin = createSupabaseAdminClient();
  const { data: settings } = await admin
    .from("email_settings")
    .select("email_address, imap_host, imap_port, smtp_host, smtp_port")
    .eq("org_id", orgId)
    .maybeSingle();

  const configured = Boolean(settings?.email_address);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="page-header">
        <h1>Email Channel</h1>
        <p>Receive and send support emails in the same inbox</p>
      </div>

      <section className="card">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
            <IconShield className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold">IMAP / SMTP settings</h2>
            <p className="text-xs text-slate-500">
              {configured
                ? `Connected: ${settings!.email_address}`
                : "Credentials are encrypted at rest"}
            </p>
          </div>
        </div>
        <form action={saveEmailSettings} className="space-y-4">
          <input type="hidden" name="orgId" value={orgId} />
          <div>
            <label className="label">Email address</label>
            <input className="input" name="emailAddress" type="email" defaultValue={settings?.email_address ?? ""} placeholder="support@yourcompany.com" required />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">IMAP host</label>
              <input className="input" name="imapHost" defaultValue={settings?.imap_host ?? ""} placeholder="imap.gmail.com" required />
            </div>
            <div>
              <label className="label">IMAP port</label>
              <input className="input" name="imapPort" type="number" defaultValue={settings?.imap_port ?? 993} required />
            </div>
            <div>
              <label className="label">SMTP host</label>
              <input className="input" name="smtpHost" defaultValue={settings?.smtp_host ?? ""} placeholder="smtp.gmail.com" required />
            </div>
            <div>
              <label className="label">SMTP port</label>
              <input className="input" name="smtpPort" type="number" defaultValue={settings?.smtp_port ?? 587} required />
            </div>
          </div>
          <div>
            <label className="label">Password / App password</label>
            <input className="input" name="password" type="password" placeholder="Enter your email password" required autoComplete="off" />
          </div>
          <button className="btn">Save email settings</button>
        </form>
      </section>
    </main>
  );
}
