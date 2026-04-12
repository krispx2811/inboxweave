import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createCannedReply, deleteCannedReply } from "./actions";
import { IconBolt, IconPlus, IconTrash } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function CannedRepliesPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const admin = createSupabaseAdminClient();
  const { data: replies } = await admin
    .from("canned_replies")
    .select("id, title, content, shortcut, category, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  const categories = [...new Set((replies ?? []).map((r) => r.category as string).filter(Boolean))];

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="page-header">
        <h1>Canned Replies</h1>
        <p>Pre-written responses your team can send with one click</p>
      </div>

      <section className="card mb-8">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
            <IconPlus className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold">New canned reply</h2>
            <p className="text-xs text-slate-500">Available to all team members in the inbox</p>
          </div>
        </div>
        <form action={createCannedReply} className="space-y-4">
          <input type="hidden" name="orgId" value={orgId} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="title">Title</label>
              <input className="input" id="title" name="title" placeholder="e.g. Greeting" required />
            </div>
            <div>
              <label className="label" htmlFor="shortcut">Shortcut (optional)</label>
              <input className="input" id="shortcut" name="shortcut" placeholder="e.g. /hello" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="category">Category (optional)</label>
            <input className="input" id="category" name="category" placeholder="e.g. Support, Sales" list="categories" />
            <datalist id="categories">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <label className="label" htmlFor="content">Message</label>
            <textarea className="input min-h-[100px]" id="content" name="content" placeholder="Hi! Thanks for reaching out. How can I help you today?" required />
          </div>
          <button className="btn">
            <IconBolt className="h-4 w-4" /> Save reply
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-4 text-sm font-semibold text-slate-500 uppercase tracking-wider">
          Saved replies ({replies?.length ?? 0})
        </h2>
        <div className="space-y-2">
          {(replies ?? []).map((r) => (
            <div key={r.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{r.title}</span>
                    {r.shortcut && <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{r.shortcut}</code>}
                    {r.category && <span className="badge-blue">{r.category}</span>}
                  </div>
                  <p className="mt-1.5 text-sm text-slate-600 whitespace-pre-wrap">{r.content}</p>
                </div>
                <form action={deleteCannedReply}>
                  <input type="hidden" name="orgId" value={orgId} />
                  <input type="hidden" name="replyId" value={r.id} />
                  <button className="btn-icon text-red-400 hover:text-red-600 hover:bg-red-50" type="submit">
                    <IconTrash className="h-4 w-4" />
                  </button>
                </form>
              </div>
            </div>
          ))}
          {replies?.length === 0 && (
            <div className="card text-center py-12">
              <IconBolt className="mx-auto h-8 w-8 text-slate-200" />
              <p className="mt-3 text-sm text-slate-400">No canned replies yet</p>
              <p className="mt-1 text-xs text-slate-400">Create one above to speed up your team&apos;s responses</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
