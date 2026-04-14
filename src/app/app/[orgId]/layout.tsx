import Link from "next/link";
import { requireOrgMember } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { IconInbox, IconChannels, IconKnowledge, IconSettings, IconArrowLeft, IconChart, IconUser, IconBolt } from "@/components/icons";
import { LogoIcon } from "@/components/Logo";
import { OnboardingTooltip } from "@/components/OnboardingTooltip";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  await requireOrgMember(orgId);
  const admin = createSupabaseAdminClient();
  const { data: org } = await admin.from("organizations").select("name").eq("id", orgId).single();

  const nav = [
    { href: `/app/${orgId}/dashboard`, label: "Dashboard", icon: IconChart },
    { href: `/app/${orgId}/inbox`, label: "Inbox", icon: IconInbox },
    { href: `/app/${orgId}/contacts`, label: "Contacts", icon: IconUser },
    { href: `/app/${orgId}/replies`, label: "Canned Replies", icon: IconBolt },
    { href: `/app/${orgId}/channels`, label: "Channels", icon: IconChannels },
    { href: `/app/${orgId}/knowledge`, label: "Knowledge", icon: IconKnowledge },
    { href: `/app/${orgId}/settings`, label: "Settings", icon: IconSettings },
  ];

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <Link href="/home" className="mb-1 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors">
            <IconArrowLeft className="h-3 w-3" /> All orgs
          </Link>
          <div className="flex items-center gap-2.5">
            <LogoIcon size={32} />
            <h2 className="text-sm font-bold truncate">{org?.name}</h2>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 px-3 py-3">
          {nav.map((item) => {
            const tooltips: Record<string, { msg: string; priority: number }> = {
              Settings: { msg: "Start here: add your OpenAI key and system prompt", priority: 1 },
              Channels: { msg: "Next: connect WhatsApp, Instagram, or Messenger", priority: 2 },
              Knowledge: { msg: "Upload docs so the AI can answer questions", priority: 3 },
            };
            const tip = tooltips[item.label];
            const link = (
              <Link key={item.href} href={item.href} className="nav-link">
                <item.icon className="h-5 w-5 shrink-0" />
                {item.label}
              </Link>
            );
            return tip ? (
              <OnboardingTooltip key={item.href} id={`nav-${item.label}`} message={tip.msg} priority={tip.priority}>
                {link}
              </OnboardingTooltip>
            ) : link;
          })}
        </nav>

        <div className="border-t border-slate-100 px-3 py-3">
          <form action="/api/auth/signout" method="post">
            <button className="nav-link w-full text-slate-400 hover:text-red-600" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
