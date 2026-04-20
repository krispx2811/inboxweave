import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { deleteKnowledgeDoc, updateKnowledgeDoc } from "../actions";
import { IconKnowledge, IconTrash } from "@/components/icons";

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

export default async function KnowledgeDocPage({
  params,
}: {
  params: Promise<{ orgId: string; docId: string }>;
}) {
  const { orgId, docId } = await params;
  const admin = createSupabaseAdminClient();

  const { data: doc } = await admin
    .from("knowledge_documents")
    .select("id, title, status, error, content, storage_path, created_at")
    .eq("id", docId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!doc) notFound();

  // Backfill for legacy docs uploaded before the `content` column existed:
  // reconstruct from chunks (with a visible divider so the user knows).
  let content = (doc.content as string | null) ?? "";
  let reconstructedFromChunks = false;
  if (!content) {
    const { data: chunks } = await admin
      .from("knowledge_chunks")
      .select("content, created_at")
      .eq("document_id", docId)
      .order("created_at", { ascending: true });
    if (chunks && chunks.length > 0) {
      content = chunks.map((c) => c.content as string).join("\n\n— — —\n\n");
      reconstructedFromChunks = true;
    }
  }

  // Signed URL for downloading the original file.
  let downloadUrl: string | null = null;
  if (doc.storage_path) {
    const { data: signed } = await admin.storage
      .from("knowledge")
      .createSignedUrl(doc.storage_path as string, 60 * 10);
    downloadUrl = signed?.signedUrl ?? null;
  }

  const { count: chunkCount } = await admin
    .from("knowledge_chunks")
    .select("id", { count: "exact", head: true })
    .eq("document_id", docId);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 flex items-center gap-3 text-sm">
        <Link href={`/app/${orgId}/knowledge`} className="text-slate-500 hover:text-slate-900">
          ← Back to knowledge
        </Link>
      </div>

      <div className="page-header">
        <div className="flex items-center gap-3">
          <IconKnowledge className="h-6 w-6 text-slate-400" />
          <h1 className="truncate">{doc.title}</h1>
          <span className={statusBadge(doc.status as string)}>{doc.status}</span>
        </div>
        <p>
          {chunkCount ?? 0} chunks · created {new Date(doc.created_at as string).toLocaleDateString()}
        </p>
      </div>

      {doc.error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Processing error.</strong> {doc.error as string}
        </div>
      )}

      {reconstructedFromChunks && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This document was uploaded before in-app editing was available, so
          the text below was reconstructed from its chunks and may contain
          small duplicated passages at the seams. Saving will re-chunk cleanly.
        </div>
      )}

      <section className="card">
        <form action={updateKnowledgeDoc} id="update-doc" className="space-y-5">
          <input type="hidden" name="orgId" value={orgId} />
          <input type="hidden" name="documentId" value={docId} />

          <div>
            <label className="label" htmlFor="title">Title</label>
            <input
              className="input"
              id="title"
              name="title"
              defaultValue={doc.title as string}
              required
              maxLength={200}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0" htmlFor="content">Content</label>
              {downloadUrl && (
                <a
                  href={downloadUrl}
                  className="text-xs text-indigo-600 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Download original
                </a>
              )}
            </div>
            <textarea
              id="content"
              name="content"
              className="input font-mono text-xs leading-relaxed"
              rows={22}
              defaultValue={content}
              required
              maxLength={500_000}
            />
            <p className="mt-2 text-[11px] text-slate-400">
              Edits are re-chunked and re-embedded on save. Aim for clear,
              factual content — one topic per paragraph improves retrieval.
            </p>
          </div>

          <button className="btn" type="submit">Save changes</button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-200">
          <form action={deleteKnowledgeDoc}>
            <input type="hidden" name="orgId" value={orgId} />
            <input type="hidden" name="documentId" value={docId} />
            <button
              className="btn-ghost btn-sm text-red-600 hover:bg-red-50 hover:border-red-200"
              type="submit"
            >
              <IconTrash className="h-4 w-4" /> Delete document
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
