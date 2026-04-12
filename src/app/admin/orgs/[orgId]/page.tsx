import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createUserForOrg } from "../../actions";
import { IconArrowLeft, IconUsers, IconPlus, IconTrash } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function OrgAdminPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  await requirePlatformAdmin();
  const { orgId } = await params;
  const admin = createSupabaseAdminClient();

  const [{ data: org }, { data: members }] = await Promise.all([
    admin.from("organizations").select("id, name, slug").eq("id", orgId).single(),
    admin
      .from("org_members")
      .select("user_id, role, created_at")
      .eq("org_id", orgId)
      .order("created_at"),
  ]);

  const emails = new Map<string, string | undefined>();
  if (members && members.length > 0) {
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    for (const u of list?.users ?? []) emails.set(u.id, u.email ?? undefined);
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <header className="page-header">
        <Link href="/admin" className="mb-2 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors">
          <IconArrowLeft className="h-3 w-3" /> All organizations
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1>{org?.name ?? "Organization"}</h1>
            <p>/{org?.slug}</p>
          </div>
          <Link href={`/app/${orgId}/inbox`} className="btn">
            Open workspace
          </Link>
        </div>
      </header>

      <section className="card mb-8">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
            <IconPlus className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold">Add user</h2>
            <p className="text-xs text-slate-500">They can sign in immediately with these credentials</p>
          </div>
        </div>
        <form action={createUserForOrg} className="space-y-4">
          <input type="hidden" name="orgId" value={orgId} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input className="input" id="email" name="email" type="email" placeholder="user@company.com" required />
            </div>
            <div>
              <label className="label" htmlFor="password">Initial password</label>
              <input className="input" id="password" name="password" type="password" minLength={8} placeholder="Min 8 characters" required />
            </div>
          </div>
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="label" htmlFor="role">Role</label>
              <select className="input" id="role" name="role" defaultValue="agent">
                <option value="owner">Owner (full access)</option>
                <option value="agent">Agent (inbox only)</option>
              </select>
            </div>
            <button className="btn">
              <IconPlus className="h-4 w-4" /> Add user
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="mb-4 text-sm font-semibold text-slate-500 uppercase tracking-wider">
          Members ({members?.length ?? 0})
        </h2>
        <div className="space-y-2">
          {(members ?? []).map((m) => {
            const email = emails.get(m.user_id);
            const initial = (email ?? "?").charAt(0).toUpperCase();
            return (
              <div key={m.user_id} className="card flex items-center gap-4">
                <div className="avatar-sm">{initial}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{email ?? m.user_id}</div>
                  <div className="text-xs text-slate-500">
                    Added {new Date(m.created_at as string).toLocaleDateString()}
                  </div>
                </div>
                <span className={m.role === "owner" ? "badge-purple" : "badge-gray"}>
                  {m.role}
                </span>
              </div>
            );
          })}
          {members?.length === 0 && (
            <div className="card text-center py-8">
              <IconUsers className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">No members yet. Add one above.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
