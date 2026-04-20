import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireOrgMember } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function DebugPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  await requireOrgMember(orgId);
  const admin = createSupabaseAdminClient();
  const { data: logs } = await admin
    .from("webhook_debug")
    .select("id, platform, method, status_code, signature_ok, parsed_count, query_string, raw_body, error, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="page-header">
        <h1>Webhook Debug Log</h1>
        <p>Last 50 incoming webhook requests (all orgs). If this is empty, Meta isn&apos;t reaching your server.</p>
      </div>

      <div className="space-y-2">
        {(logs ?? []).map((l) => (
          <details key={l.id} className="card">
            <summary className="cursor-pointer flex items-center gap-2 text-sm">
              <span className={
                l.status_code === 200 ? "badge-green" :
                l.status_code === 401 ? "badge-red" :
                l.status_code === 403 ? "badge-amber" :
                "badge-gray"
              }>
                {l.method} {l.status_code}
              </span>
              <span className="badge-blue">{l.platform}</span>
              {l.signature_ok === true && <span className="badge-green">sig OK</span>}
              {l.signature_ok === false && <span className="badge-red">sig FAIL</span>}
              {l.parsed_count !== null && (
                <span className="text-xs text-slate-500">{l.parsed_count} messages</span>
              )}
              <span className="text-xs text-slate-400 ml-auto">
                {new Date(l.created_at as string).toLocaleString()}
              </span>
            </summary>
            <div className="mt-3 space-y-2 text-xs">
              {l.error && (
                <div className="rounded bg-red-50 text-red-800 p-2 font-mono">{l.error as string}</div>
              )}
              {l.query_string && (
                <div>
                  <div className="font-semibold text-slate-500">Query:</div>
                  <code className="block bg-slate-50 p-2 rounded break-all">{l.query_string as string}</code>
                </div>
              )}
              {l.raw_body && (
                <div>
                  <div className="font-semibold text-slate-500">Body:</div>
                  <pre className="bg-slate-50 p-2 rounded overflow-auto max-h-64 text-[10px]">{l.raw_body as string}</pre>
                </div>
              )}
            </div>
          </details>
        ))}
        {(!logs || logs.length === 0) && (
          <div className="card text-center py-12">
            <p className="text-sm text-slate-500 font-semibold">No webhook hits yet</p>
            <p className="mt-2 text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              This means Meta is NOT reaching your server. Check:<br />
              1. The webhook URL is correctly registered in the Meta dashboard<br />
              2. The verify token matches<br />
              3. You clicked &ldquo;Verify and Save&rdquo; in Meta<br />
              4. You subscribed to the &ldquo;messages&rdquo; field
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
