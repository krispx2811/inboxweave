import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { saveSmsSettings } from "./actions";

export const dynamic = "force-dynamic";

export default async function SmsChannelPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const admin = createSupabaseAdminClient();
  const { data: settings } = await admin
    .from("sms_settings")
    .select("twilio_account_sid, twilio_phone_number")
    .eq("org_id", orgId)
    .maybeSingle();

  const configured = Boolean(settings?.twilio_phone_number);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="page-header">
        <h1>SMS Channel (Twilio)</h1>
        <p>Receive and send SMS messages through Twilio</p>
      </div>

      <section className="card">
        <h2 className="font-semibold mb-1">Twilio credentials</h2>
        <p className="text-xs text-slate-500 mb-5">
          {configured
            ? `Connected: ${settings!.twilio_phone_number}`
            : "Get your Account SID, Auth Token, and phone number from the Twilio Console."}
        </p>
        <form action={saveSmsSettings} className="space-y-4">
          <input type="hidden" name="orgId" value={orgId} />
          <div>
            <label className="label">Account SID</label>
            <input className="input" name="accountSid" defaultValue={(settings?.twilio_account_sid as string) ?? ""} placeholder="AC..." required />
          </div>
          <div>
            <label className="label">Auth Token</label>
            <input className="input" name="authToken" type="password" placeholder="Your Twilio auth token" required autoComplete="off" />
          </div>
          <div>
            <label className="label">Phone Number</label>
            <input className="input" name="phoneNumber" defaultValue={(settings?.twilio_phone_number as string) ?? ""} placeholder="+1234567890" required />
          </div>
          <button className="btn">Save SMS settings</button>
        </form>
        <p className="mt-4 text-xs text-slate-400">
          Webhook URL (set in Twilio Console): <code className="text-[10px]">{appUrl}/api/webhooks/sms</code>
        </p>
      </section>
    </main>
  );
}
