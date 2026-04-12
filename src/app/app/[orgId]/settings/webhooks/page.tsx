import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { addWebhook, deleteWebhook } from "./actions";
import { IconPlus, IconTrash, IconGlobe } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function WebhooksPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const admin = createSupabaseAdminClient();
  const { data: subs } = await admin
    .from("webhook_subscriptions")
    .select("id, url, events, is_active, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="page-header">
        <h1>Webhook Events</h1>
        <p>Push real-time events to your own systems</p>
      </div>

      <section className="card mb-8">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-600"><IconPlus className="h-5 w-5" /></div>
          <div>
            <h2 className="font-semibold">Add webhook</h2>
            <p className="text-xs text-slate-500">We sign payloads with HMAC-SHA256</p>
          </div>
        </div>
        <form action={addWebhook} className="space-y-4">
          <input type="hidden" name="orgId" value={orgId} />
          <div>
            <label className="label">Endpoint URL</label>
            <input className="input" name="url" type="url" placeholder="https://your-service.com/webhook" required />
          </div>
          <div>
            <label className="label">Events (comma-separated)</label>
            <input className="input" name="events" placeholder="message.inbound, conversation.resolved, conversation.escalated, csat.received" defaultValue="*" />
            <p className="mt-1 text-[10px] text-slate-400">Use * to receive all events</p>
          </div>
          <button className="btn"><IconPlus className="h-4 w-4" /> Add webhook</button>
        </form>
      </section>

      <section>
        <h2 className="mb-4 text-sm font-semibold text-slate-500 uppercase tracking-wider">Active webhooks ({subs?.length ?? 0})</h2>
        <div className="space-y-2">
          {(subs ?? []).map((s) => (
            <div key={s.id} className="card flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-50"><IconGlobe className="h-5 w-5 text-slate-400" /></div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate text-sm">{s.url}</div>
                <div className="flex gap-1 mt-0.5">
                  {(s.events as string[]).map((e) => <span key={e} className="badge-gray !text-[10px]">{e}</span>)}
                </div>
              </div>
              <form action={deleteWebhook}>
                <input type="hidden" name="orgId" value={orgId} />
                <input type="hidden" name="webhookId" value={s.id} />
                <button className="btn-icon text-red-400 hover:text-red-600 hover:bg-red-50" type="submit"><IconTrash className="h-4 w-4" /></button>
              </form>
            </div>
          ))}
          {subs?.length === 0 && (
            <div className="card text-center py-8">
              <IconGlobe className="mx-auto h-8 w-8 text-slate-200" />
              <p className="mt-3 text-sm text-slate-400">No webhooks configured</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
