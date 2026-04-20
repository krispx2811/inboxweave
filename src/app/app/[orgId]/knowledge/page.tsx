import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { deleteKnowledgeDoc, uploadKnowledgeDoc } from "./actions";
import { IconUpload, IconKnowledge, IconTrash } from "@/components/icons";

export const dynamic = "force-dynamic";

function statusBadge(status: string) {
  switch (status) {
    case "ready":      return "badge-green";
    case "processing": return "badge-blue";
    case "pending":    return "badge-amber";
    case "error":      return "badge-red";
    default:           return "badge-gray";
  }
}

export default async function KnowledgePage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const admin = createSupabaseAdminClient();
  const { data: docs } = await admin
    .from("knowledge_documents")
    .select("id, title, status, error, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="page-header">
        <h1>Knowledge base</h1>
        <p>Upload documents so the AI can answer questions about your business</p>
      </div>

      <section className="card mb-8">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <IconUpload className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold">Upload document</h2>
            <p className="text-xs text-slate-500">PDF, Markdown, or plain text (max 10 MB)</p>
          </div>
        </div>
        <form action={uploadKnowledgeDoc} className="space-y-4">
          <input type="hidden" name="orgId" value={orgId} />
          <div>
            <label className="label" htmlFor="title">Document title</label>
            <input className="input" id="title" name="title" placeholder="e.g. Product FAQ, Pricing Guide" required />
          </div>
          <div>
            <label className="label" htmlFor="file">File</label>
            <input
              className="input file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-indigo-600 hover:file:bg-indigo-100"
              id="file"
              name="file"
              type="file"
              accept=".pdf,.md,.txt,.markdown"
              required
            />
          </div>
          <button className="btn">
            <IconUpload className="h-4 w-4" /> Upload & process
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-4 text-sm font-semibold text-slate-500 uppercase tracking-wider">
          Documents ({docs?.length ?? 0})
        </h2>
        <div className="space-y-2">
          {(docs ?? []).map((d) => (
            <div key={d.id} className="card flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-50">
                <IconKnowledge className="h-5 w-5 text-slate-400" />
              </div>
              <Link
                href={`/app/${orgId}/knowledge/${d.id}`}
                className="min-w-0 flex-1 hover:opacity-80"
              >
                <div className="font-semibold truncate">{d.title}</div>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                  <span className={statusBadge(d.status as string)}>{d.status}</span>
                  {d.error && <span className="text-red-500 truncate">{d.error}</span>}
                  <span>{new Date(d.created_at as string).toLocaleDateString()}</span>
                </div>
              </Link>
              <Link
                href={`/app/${orgId}/knowledge/${d.id}`}
                className="btn-ghost btn-sm"
              >
                View / Edit
              </Link>
              <form action={deleteKnowledgeDoc}>
                <input type="hidden" name="orgId" value={orgId} />
                <input type="hidden" name="documentId" value={d.id} />
                <button className="btn-ghost btn-sm text-red-600 hover:bg-red-50 hover:border-red-200" type="submit">
                  <IconTrash className="h-4 w-4" />
                </button>
              </form>
            </div>
          ))}
          {docs?.length === 0 && (
            <div className="card text-center py-12">
              <IconKnowledge className="mx-auto h-8 w-8 text-slate-200" />
              <p className="mt-3 text-sm text-slate-400">No documents yet</p>
              <p className="mt-1 text-xs text-slate-400">
                Upload FAQs, product guides, or policies.<br />
                The AI will use them to answer customer questions.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
