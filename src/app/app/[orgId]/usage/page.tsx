import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireOrgMember } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

interface UsageRow {
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  cost_usd: number | null;
  created_at: string;
}

function fmtUsd(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function bucket(rows: UsageRow[], sinceMs: number) {
  let tokens = 0, cost = 0, calls = 0;
  const byModel: Record<string, { tokens: number; cost: number; calls: number }> = {};
  const cutoff = Date.now() - sinceMs;
  for (const r of rows) {
    if (new Date(r.created_at).getTime() < cutoff) continue;
    tokens += r.total_tokens ?? 0;
    cost += Number(r.cost_usd ?? 0);
    calls++;
    const m = r.model ?? "unknown";
    byModel[m] = byModel[m] ?? { tokens: 0, cost: 0, calls: 0 };
    byModel[m].tokens += r.total_tokens ?? 0;
    byModel[m].cost += Number(r.cost_usd ?? 0);
    byModel[m].calls++;
  }
  return { tokens, cost, calls, byModel };
}

export default async function UsagePage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  await requireOrgMember(orgId);
  const admin = createSupabaseAdminClient();

  const { data: rows } = await admin
    .from("usage_logs")
    .select("model, prompt_tokens, completion_tokens, total_tokens, cost_usd, created_at")
    .eq("org_id", orgId)
    .gte("created_at", new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false });
  const data = (rows ?? []) as UsageRow[];

  const today = bucket(data, 24 * 60 * 60 * 1000);
  const week = bucket(data, 7 * 24 * 60 * 60 * 1000);
  const month = bucket(data, 30 * 24 * 60 * 60 * 1000);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="page-header">
        <h1>OpenAI usage</h1>
        <p>Tokens and cost over time for this organization</p>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
        {[
          { label: "Last 24h", b: today },
          { label: "Last 7 days", b: week },
          { label: "Last 30 days", b: month },
        ].map((card) => (
          <div key={card.label} className="card">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {card.label}
            </div>
            <div className="mt-2 text-2xl font-bold">{fmtUsd(card.b.cost)}</div>
            <div className="mt-1 text-xs text-slate-500">
              {card.b.tokens.toLocaleString()} tokens · {card.b.calls} calls
            </div>
          </div>
        ))}
      </section>

      <section className="card mb-6">
        <h2 className="font-semibold mb-3">By model (last 30 days)</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="text-left py-1.5">Model</th>
              <th className="text-right py-1.5">Calls</th>
              <th className="text-right py-1.5">Tokens</th>
              <th className="text-right py-1.5">Cost</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(month.byModel)
              .sort((a, b) => b[1].cost - a[1].cost)
              .map(([model, stats]) => (
                <tr key={model} className="border-b border-slate-100">
                  <td className="py-2 font-mono text-xs">{model}</td>
                  <td className="py-2 text-right">{stats.calls}</td>
                  <td className="py-2 text-right">{stats.tokens.toLocaleString()}</td>
                  <td className="py-2 text-right">{fmtUsd(stats.cost)}</td>
                </tr>
              ))}
            {Object.keys(month.byModel).length === 0 && (
              <tr>
                <td className="py-4 text-center text-slate-400" colSpan={4}>
                  No AI calls yet in the last 30 days.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-slate-400">
        Costs are estimated from OpenAI's published per-token pricing at time
        of call. Switch model in <a href={`/app/${orgId}/settings`} className="underline">Settings</a>.
      </p>
    </main>
  );
}
