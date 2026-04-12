import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requestGdprExport, requestGdprDelete } from "./actions";
import { IconUser, IconTrash, IconShield } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function GdprPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const admin = createSupabaseAdminClient();
  const { data: requests } = await admin
    .from("gdpr_requests")
    .select("id, contact_external_id, request_type, status, created_at, completed_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="page-header">
        <h1>GDPR & Privacy</h1>
        <p>Data export and right-to-delete for your contacts</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-8">
        <section className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-600"><IconUser className="h-5 w-5" /></div>
            <h2 className="font-semibold">Export contact data</h2>
          </div>
          <p className="text-xs text-slate-500 mb-4">Export all messages and data for a specific contact. Generates a CSV download.</p>
          <form action={requestGdprExport} className="space-y-3">
            <input type="hidden" name="orgId" value={orgId} />
            <div>
              <label className="label">Contact ID (phone/email/PSID)</label>
              <input className="input" name="contactId" placeholder="e.g. +1234567890" required />
            </div>
            <button className="btn-ghost">Request export</button>
          </form>
        </section>

        <section className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 text-red-600"><IconTrash className="h-5 w-5" /></div>
            <h2 className="font-semibold">Delete contact data</h2>
          </div>
          <p className="text-xs text-slate-500 mb-4">Permanently delete all messages, conversations, and data for a contact. Cannot be undone.</p>
          <form action={requestGdprDelete} className="space-y-3">
            <input type="hidden" name="orgId" value={orgId} />
            <div>
              <label className="label">Contact ID</label>
              <input className="input" name="contactId" placeholder="e.g. +1234567890" required />
            </div>
            <button className="btn-danger btn-sm">Delete all data</button>
          </form>
        </section>
      </div>

      <section>
        <h2 className="mb-4 text-sm font-semibold text-slate-500 uppercase tracking-wider">Request history</h2>
        <div className="space-y-2">
          {(requests ?? []).map((r) => (
            <div key={r.id} className="card flex items-center gap-4">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${r.request_type === "delete" ? "bg-red-50 text-red-500" : "bg-blue-50 text-blue-500"}`}>
                {r.request_type === "delete" ? <IconTrash className="h-4 w-4" /> : <IconShield className="h-4 w-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{r.request_type} — {r.contact_external_id}</div>
                <div className="text-xs text-slate-500">{new Date(r.created_at as string).toLocaleString()}</div>
              </div>
              <span className={r.status === "completed" ? "badge-green" : r.status === "pending" ? "badge-amber" : "badge-gray"}>{r.status}</span>
            </div>
          ))}
          {requests?.length === 0 && <p className="text-sm text-slate-400">No requests yet.</p>}
        </div>
      </section>
    </main>
  );
}
