import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { IconSparkle, IconSettings, IconChannels, IconKnowledge, IconInbox } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await requireUser();
  const admin = createSupabaseAdminClient();

  const { data: memberships } = await admin
    .from("org_members")
    .select("org_id, role, organizations(id, name)")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) redirect("/home");

  const m = memberships[0]!;
  const org = (m as unknown as { organizations: { id: string; name: string } }).organizations;
  const orgId = org.id;

  // Check what's been set up.
  const [{ data: secrets }, { data: channels }, { data: docs }] = await Promise.all([
    admin.from("org_secrets").select("org_id").eq("org_id", orgId).maybeSingle(),
    admin.from("channels").select("id").eq("org_id", orgId).limit(1),
    admin.from("knowledge_documents").select("id").eq("org_id", orgId).limit(1),
  ]);

  const hasKey = Boolean(secrets);
  const hasChannel = (channels?.length ?? 0) > 0;
  const hasDocs = (docs?.length ?? 0) > 0;

  const steps = [
    { label: "Add your OpenAI API key", href: `/app/${orgId}/settings`, done: hasKey, icon: IconSettings, desc: "So the AI can respond to messages" },
    { label: "Connect a channel", href: `/app/${orgId}/channels`, done: hasChannel, icon: IconChannels, desc: "WhatsApp, Instagram, Messenger, or Email" },
    { label: "Upload knowledge", href: `/app/${orgId}/knowledge`, done: hasDocs, icon: IconKnowledge, desc: "FAQs, product info — the AI uses these to answer" },
    { label: "Start chatting", href: `/app/${orgId}/inbox`, done: false, icon: IconInbox, desc: "Your inbox is ready once channels are connected" },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount >= 3;

  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <div className="text-center mb-10">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-200">
          <IconSparkle className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold">Welcome to InboxWeave!</h1>
        <p className="mt-2 text-sm text-slate-500">
          Let&apos;s set up <strong>{org.name}</strong>. Complete these steps to go live.
        </p>
        <div className="mt-4 flex justify-center gap-1.5">
          {steps.map((s, i) => (
            <div key={i} className={`h-2 w-12 rounded-full ${s.done ? "bg-indigo-600" : "bg-slate-200"}`} />
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400">{completedCount} of {steps.length} complete</p>
      </div>

      <div className="space-y-3">
        {steps.map((step, i) => (
          <Link key={i} href={step.href} className={`card-hover flex items-center gap-4 ${step.done ? "opacity-60" : ""}`}>
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${step.done ? "bg-emerald-100 text-emerald-600" : "bg-indigo-100 text-indigo-600"}`}>
              {step.done ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              ) : (
                <step.icon />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className={`font-semibold ${step.done ? "line-through text-slate-400" : ""}`}>{step.label}</div>
              <div className="text-xs text-slate-500">{step.desc}</div>
            </div>
            {!step.done && <span className="text-xs text-indigo-500 font-semibold">Set up</span>}
          </Link>
        ))}
      </div>

      {allDone && (
        <div className="mt-8 text-center">
          <Link href={`/app/${orgId}/inbox`} className="btn px-8 py-3 text-base">
            Open your inbox
          </Link>
        </div>
      )}

      <div className="mt-8 text-center">
        <Link href={`/app/${orgId}/inbox`} className="text-sm text-slate-400 hover:text-slate-600">
          Skip setup and go to inbox
        </Link>
      </div>
    </main>
  );
}
