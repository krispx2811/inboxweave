import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createOrganization, promoteSelfToAdmin } from "./actions";
import { IconBuilding, IconPlus, IconArrowLeft, IconShield, IconUsers } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const user = await requireUser();
  const admin = createSupabaseAdminClient();

  const { data: isAdmin } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!isAdmin) {
    const { count } = await admin
      .from("platform_admins")
      .select("user_id", { count: "exact", head: true });
    if ((count ?? 0) === 0) {
      return (
        <main className="flex min-h-screen items-center justify-center px-6">
          <div className="max-w-sm text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
              <IconShield className="h-7 w-7" />
            </div>
            <h1 className="text-xl font-bold">Set up your platform</h1>
            <p className="mt-2 text-sm text-slate-500">
              No admin exists yet. Claim admin access for <strong>{user.email}</strong>.
            </p>
            <form action={promoteSelfToAdmin} className="mt-6">
              <button className="btn px-8">Claim admin access</button>
            </form>
          </div>
        </main>
      );
    }
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="text-center">
          <h1 className="text-xl font-bold">Not authorized</h1>
          <p className="mt-2 text-sm text-slate-500">Only platform admins can access this page.</p>
          <Link href="/home" className="btn-ghost mt-4">Go back</Link>
        </div>
      </main>
    );
  }

  const { data: orgs } = await admin
    .from("organizations")
    .select("id, name, slug, created_at")
    .order("created_at", { ascending: false });

  // Get member count per org.
  const memberCounts = new Map<string, number>();
  if (orgs && orgs.length > 0) {
    for (const o of orgs) {
      const { count } = await admin
        .from("org_members")
        .select("user_id", { count: "exact", head: true })
        .eq("org_id", o.id);
      memberCounts.set(o.id, count ?? 0);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <header className="page-header flex items-center justify-between">
        <div>
          <Link href="/home" className="mb-2 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors">
            <IconArrowLeft className="h-3 w-3" /> Back
          </Link>
          <h1>Platform admin</h1>
          <p>Manage organizations and users</p>
        </div>
      </header>

      <section className="card mb-8">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <IconPlus className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold">New organization</h2>
            <p className="text-xs text-slate-500">URL slug is auto-generated from the name</p>
          </div>
        </div>
        <form action={createOrganization} className="flex gap-3">
          <input
            className="input flex-1"
            name="name"
            placeholder="e.g. Finland Eye Center"
            required
          />
          <input type="hidden" name="slug" value="" />
          <button className="btn whitespace-nowrap">
            <IconPlus className="h-4 w-4" /> Create
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-4 text-sm font-semibold text-slate-500 uppercase tracking-wider">
          Organizations ({orgs?.length ?? 0})
        </h2>
        <div className="space-y-2">
          {(orgs ?? []).map((o) => (
            <Link key={o.id} href={`/admin/orgs/${o.id}`} className="card-hover flex items-center gap-4">
              <div className="avatar-md bg-indigo-50 text-indigo-600">
                {o.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{o.name}</div>
                <div className="text-xs text-slate-500">/{o.slug}</div>
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-400">
                <IconUsers className="h-3.5 w-3.5" />
                {memberCounts.get(o.id) ?? 0}
              </div>
            </Link>
          ))}
          {orgs?.length === 0 && (
            <div className="card text-center py-12">
              <IconBuilding className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">
                No organizations yet. Create one above to get started.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
