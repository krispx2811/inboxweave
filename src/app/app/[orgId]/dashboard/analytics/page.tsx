import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { IconChart, IconClock, IconSparkle } from "@/components/icons";

export const dynamic = "force-dynamic";

function fmtDuration(seconds: number | null): string {
  if (!seconds) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

export default async function AnalyticsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const admin = createSupabaseAdminClient();
  const { data: raw } = await admin.rpc("conversation_analytics", { p_org_id: orgId, p_days: 30 });
  const a = (raw ?? {}) as {
    response_times?: { avg_first_reply_seconds?: number; median_first_reply_seconds?: number; p95_first_reply_seconds?: number };
    resolution?: { resolved_count?: number; total_count?: number; avg_resolution_seconds?: number };
    hourly?: Array<{ hour: number; count: number }>;
    sentiment?: Array<{ sentiment: string; count: number }>;
    csat?: { avg_rating?: number; total_ratings?: number };
  };

  const hourly = a.hourly ?? [];
  const maxHourly = Math.max(...hourly.map((h) => h.count), 1);
  const sentiments = a.sentiment ?? [];
  const totalSentiment = sentiments.reduce((s, x) => s + x.count, 0) || 1;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="page-header">
        <h1>Conversation Analytics</h1>
        <p>Response times, resolution rates, and customer sentiment (last 30 days)</p>
      </div>

      {/* Response time cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-8">
        {[
          { label: "Avg first reply", value: fmtDuration(a.response_times?.avg_first_reply_seconds ?? null), icon: IconClock, color: "bg-blue-100 text-blue-600" },
          { label: "Median first reply", value: fmtDuration(a.response_times?.median_first_reply_seconds ?? null), icon: IconClock, color: "bg-indigo-100 text-indigo-600" },
          { label: "P95 first reply", value: fmtDuration(a.response_times?.p95_first_reply_seconds ?? null), icon: IconClock, color: "bg-purple-100 text-purple-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card flex items-center gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color}`}><Icon className="h-5 w-5" /></div>
            <div>
              <div className="text-2xl font-bold">{value}</div>
              <div className="text-xs text-slate-500">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Resolution + CSAT */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-8">
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-500 mb-3">Resolution</h3>
          <div className="text-3xl font-bold">
            {a.resolution?.total_count ? Math.round(((a.resolution.resolved_count ?? 0) / a.resolution.total_count) * 100) : 0}%
          </div>
          <div className="text-xs text-slate-500">{a.resolution?.resolved_count ?? 0} resolved of {a.resolution?.total_count ?? 0}</div>
          <div className="mt-2 text-xs text-slate-500">
            Avg resolution time: {fmtDuration(a.resolution?.avg_resolution_seconds ?? null)}
          </div>
        </div>
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-500 mb-3">Customer Satisfaction</h3>
          <div className="text-3xl font-bold">{a.csat?.avg_rating?.toFixed(1) ?? "—"}<span className="text-lg text-slate-400">/5</span></div>
          <div className="text-xs text-slate-500">{a.csat?.total_ratings ?? 0} ratings</div>
          {(a.csat?.avg_rating ?? 0) > 0 && (
            <div className="mt-2 flex gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <span key={star} className={`text-lg ${star <= Math.round(a.csat?.avg_rating ?? 0) ? "text-amber-400" : "text-slate-200"}`}>&#9733;</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Hourly heatmap */}
      <section className="card mb-8">
        <h3 className="text-sm font-semibold text-slate-500 mb-4 flex items-center gap-2"><IconChart className="h-4 w-4" /> Busiest hours</h3>
        <div className="flex items-end gap-0.5 h-32">
          {Array.from({ length: 24 }, (_, h) => {
            const entry = hourly.find((e) => e.hour === h);
            const count = entry?.count ?? 0;
            const pct = (count / maxHourly) * 100;
            return (
              <div key={h} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-indigo-500 transition-all"
                  style={{ height: `${Math.max(pct, 2)}%` }}
                  title={`${h}:00 — ${count} messages`}
                />
                {h % 3 === 0 && <span className="text-[8px] text-slate-400">{h}</span>}
              </div>
            );
          })}
        </div>
        <div className="mt-1 text-[10px] text-slate-400 text-center">Hour of day (UTC)</div>
      </section>

      {/* Sentiment */}
      <section className="card">
        <h3 className="text-sm font-semibold text-slate-500 mb-4 flex items-center gap-2"><IconSparkle className="h-4 w-4" /> Sentiment breakdown</h3>
        <div className="space-y-2">
          {(["positive", "neutral", "negative", "angry"] as const).map((s) => {
            const entry = sentiments.find((e) => e.sentiment === s);
            const count = entry?.count ?? 0;
            const pct = Math.round((count / totalSentiment) * 100);
            const colors: Record<string, string> = { positive: "bg-emerald-500", neutral: "bg-slate-400", negative: "bg-amber-500", angry: "bg-red-500" };
            return (
              <div key={s} className="flex items-center gap-3">
                <span className="w-16 text-xs font-medium capitalize">{s}</span>
                <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${colors[s]}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-slate-500 w-12 text-right">{pct}%</span>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
