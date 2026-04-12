import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { IconBuilding, IconShield, IconLogout } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser();
  const admin = createSupabaseAdminClient();

  const [{ data: memberships }, { data: isAdmin }] = await Promise.all([
    admin
      .from("org_members")
      .select("org_id, role, organizations(id, name, slug)")
      .eq("user_id", user.id),
    admin.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
  ]);

  if (!isAdmin && memberships && memberships.length === 1) {
    redirect(`/app/${memberships[0].org_id}/inbox`);
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your organizations</h1>
          <p className="mt-1 text-sm text-slate-500">{user.email}</p>
        </div>
        <form action="/api/auth/signout" method="post">
          <button className="btn-ghost btn-sm gap-1.5" type="submit">
            <IconLogout className="h-4 w-4" /> Sign out
          </button>
        </form>
      </header>

      <div className="space-y-3">
        {isAdmin && (
          <Link href="/admin" className="card-hover flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
              <IconShield />
            </div>
            <div>
              <div className="font-semibold text-indigo-600">Platform admin</div>
              <div className="text-sm text-slate-500">Create orgs and provision users</div>
            </div>
          </Link>
        )}

        {(memberships ?? []).map((m) => {
          const org = (m as unknown as { organizations: { id: string; name: string; slug: string } }).organizations;
          return (
            <Link key={m.org_id} href={`/app/${org.id}/inbox`} className="card-hover flex items-center gap-4">
              <div className="avatar-md bg-slate-100 text-slate-600">
                <IconBuilding />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{org.name}</div>
                <div className="text-sm text-slate-500">
                  {m.role === "owner" ? "Owner" : "Agent"}
                </div>
              </div>
              <span className="text-xs text-slate-400">Open</span>
            </Link>
          );
        })}

        {(!memberships || memberships.length === 0) && !isAdmin && (
          <div className="card text-center py-12">
            <IconBuilding className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">
              You aren&apos;t a member of any organization yet.<br />
              Ask an admin to add you.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
