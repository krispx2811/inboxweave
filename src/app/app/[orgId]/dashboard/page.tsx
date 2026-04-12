import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  IconChart,
  IconInbox,
  IconSparkle,
  IconWhatsApp,
  IconFacebook,
  IconInstagram,
} from "@/components/icons";
import { AnimatedBarChart } from "@/components/charts/AnimatedBar";
import { Sparkline } from "@/components/charts/Sparkline";
import { DateRangePicker } from "@/components/charts/DateRangePicker";

export const dynamic = "force-dynamic";

type Analytics = {
  messages: { total_messages: number; inbound: number; outbound: number; ai_replies: number; human_replies: number; contact_messages: number };
  conversations: { total_conversations: number; ai_enabled_count: number };
  channels: { platform: string; message_count: number }[];
  daily: { day: string; inbound: number; outbound: number }[];
  usage: { total_tokens: number; total_cost: number };
};

function platformIcon(platform: string) {
  switch (platform) {
    case "whatsapp":  return <IconWhatsApp className="h-4 w-4 text-emerald-500" />;
    case "messenger": return <IconFacebook className="h-4 w-4 text-blue-600" />;
    case "instagram": return <IconInstagram className="h-4 w-4 text-pink-500" />;
    default:          return <IconInbox className="h-4 w-4 text-slate-400" />;
  }
}

function platformBadge(platform: string) {
  switch (platform) {
    case "whatsapp":  return "badge-green";
    case "messenger": return "badge-blue";
    case "instagram": return "badge-purple";
    default:          return "badge-gray";
  }
}

function fmt(n: number) {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k`
    : String(n);
}

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { orgId } = await params;
  const { days: daysParam } = await searchParams;
  const days = parseInt(daysParam ?? "14", 10) || 14;
  const admin = createSupabaseAdminClient();

  const { data: raw } = await admin.rpc("org_analytics", {
    p_org_id: orgId,
    p_days: days,
  });

  const fallback: Analytics = {
    messages: { total_messages: 0, inbound: 0, outbound: 0, ai_replies: 0, human_replies: 0, contact_messages: 0 },
    conversations: { total_conversations: 0, ai_enabled_count: 0 },
    channels: [],
    daily: [],
    usage: { total_tokens: 0, total_cost: 0 },
  };
  const r = (raw as unknown as Analytics) ?? fallback;
  const a: Analytics = {
    messages: r.messages ?? fallback.messages,
    conversations: r.conversations ?? fallback.conversations,
    channels: r.channels ?? [],
    daily: r.daily ?? [],
    usage: r.usage ?? fallback.usage,
  };

  const { data: recentUsage } = await admin
    .from("usage_logs")
    .select("id, created_at, model, total_tokens, cost_usd")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(5);

  const totalReplies = a.messages.ai_replies + a.messages.human_replies;
  const aiRate = totalReplies > 0 ? Math.round((a.messages.ai_replies / totalReplies) * 100) : 0;
  const maxDaily = Math.max(...a.daily.map((d) => d.inbound + d.outbound), 1);

  // Build sparkline data from daily volume (last 7 points).
  const dailyTotals = a.daily.slice(-7).map((d) => d.inbound + d.outbound);
  const dailyInbound = a.daily.slice(-7).map((d) => d.inbound);

  const stats = [
    { icon: <IconInbox className="h-5 w-5" />, color: "bg-blue-100 text-blue-600", value: fmt(a.messages.total_messages), label: "Total Messages", spark: dailyTotals },
    { icon: <IconChart className="h-5 w-5" />, color: "bg-emerald-100 text-emerald-600", value: fmt(a.conversations.total_conversations), label: "Conversations", spark: dailyInbound },
    { icon: <IconSparkle className="h-5 w-5" />, color: "bg-purple-100 text-purple-600", value: `${aiRate}%`, label: "AI Reply Rate", spark: [] as number[] },
    { icon: <IconChart className="h-5 w-5" />, color: "bg-amber-100 text-amber-600", value: fmt(a.usage.total_tokens), label: "Token Usage", spark: [] as number[] },
  ];

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1>Dashboard</h1>
          <p>Analytics overview for the last {days} days</p>
        </div>
        <DateRangePicker basePath={`/app/${orgId}/dashboard`} />
      </div>

      {/* ── Stat Cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="card flex flex-col items-center text-center gap-2 py-5">
            <span className={`inline-flex items-center justify-center h-10 w-10 rounded-full ${s.color}`}>
              {s.icon}
            </span>
            <span className="text-2xl font-bold">{s.value}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">{s.label}</span>
            {s.spark.length >= 2 && <Sparkline data={s.spark} />}
          </div>
        ))}
      </div>

      {/* ── Daily Volume Bar Chart (Animated) ──────────────── */}
      <section className="card mb-6">
        <h2 className="text-sm font-semibold mb-4">Daily Message Volume</h2>
        <AnimatedBarChart
          height={160}
          values={a.daily.map((d) => ({
            label: new Date(d.day).toLocaleDateString("en", { weekday: "short", day: "numeric" }),
            value: d.inbound + d.outbound,
          }))}
        />
        <div className="flex items-center gap-4 mt-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-indigo-500" /> Messages</span>
        </div>
      </section>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* ── Channel Breakdown ────────────────────────────── */}
        <section className="card">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Channels</h2>
          {a.channels.length === 0 ? (
            <p className="text-sm text-slate-400">No channel data yet</p>
          ) : (
            <ul className="space-y-3">
              {a.channels.map((ch) => (
                <li key={ch.platform} className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    {platformIcon(ch.platform)}
                    <span className={platformBadge(ch.platform)}>{ch.platform}</span>
                  </span>
                  <span className="text-sm font-semibold text-slate-700">{fmt(ch.message_count)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── AI vs Human Ratio ────────────────────────────── */}
        <section className="card">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">AI vs Human Replies</h2>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl font-bold text-indigo-600">{aiRate}%</span>
            <span className="text-sm text-slate-500">handled by AI</span>
          </div>
          <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden flex">
            <div
              className="bg-indigo-500 h-full transition-all rounded-l-full"
              style={{ width: `${aiRate}%` }}
            />
            <div
              className="bg-slate-300 h-full transition-all rounded-r-full"
              style={{ width: `${100 - aiRate}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-[11px] text-slate-500">
            <span>AI: {fmt(a.messages.ai_replies)}</span>
            <span>Human: {fmt(a.messages.human_replies)}</span>
          </div>
        </section>
      </div>

      {/* ── Recent Usage ────────────────────────────────────── */}
      <section className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-700">Recent Usage</h2>
          <span className="badge-blue">
            Total: ${a.usage.total_cost.toFixed(4)}
          </span>
        </div>
        {!recentUsage?.length ? (
          <p className="text-sm text-slate-400">No usage recorded yet</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase text-slate-400 border-b border-slate-100">
                <th className="pb-2 font-medium">Model</th>
                <th className="pb-2 font-medium">Tokens</th>
                <th className="pb-2 font-medium text-right">Cost</th>
                <th className="pb-2 font-medium text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {recentUsage.map((u) => (
                <tr key={u.id} className="text-slate-600">
                  <td className="py-2 font-medium">{u.model}</td>
                  <td className="py-2">{fmt(u.total_tokens)}</td>
                  <td className="py-2 text-right">${Number(u.cost_usd).toFixed(4)}</td>
                  <td className="py-2 text-right text-slate-400 text-xs">
                    {new Date(u.created_at).toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Quick links ────────────────────────────────────── */}
      <div className="mt-6 flex flex-wrap gap-3">
        <a href={`/app/${orgId}/dashboard/analytics`} className="btn-ghost btn-sm">Detailed Analytics</a>
        <a href={`/api/export?orgId=${orgId}&type=conversations`} className="btn-ghost btn-sm">Export Conversations CSV</a>
        <a href={`/api/export?orgId=${orgId}&type=messages`} className="btn-ghost btn-sm">Export Messages CSV</a>
        <a href={`/api/export?orgId=${orgId}&type=contacts`} className="btn-ghost btn-sm">Export Contacts CSV</a>
      </div>
    </main>
  );
}
