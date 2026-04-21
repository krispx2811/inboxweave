"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrgMember } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { chunkText } from "@/lib/ai/rag";
import { embedText } from "@/lib/ai/openai";

const UploadSchema = z.object({
  orgId: z.string().uuid(),
  title: z.string().min(1).max(200),
});

/**
 * Accepts a .md / .txt / .pdf upload, extracts text, chunks + embeds, and
 * writes rows into knowledge_documents + knowledge_chunks. Embedding uses
 * the org's BYOK OpenAI key.
 */
export async function uploadKnowledgeDoc(formData: FormData) {
  const parsed = UploadSchema.parse({
    orgId: formData.get("orgId"),
    title: formData.get("title"),
  });
  const ctx = await requireOrgMember(parsed.orgId);
  if (ctx.role !== "owner") throw new Error("Only owners can upload knowledge");

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Missing file");
  if (file.size === 0) throw new Error("Empty file");
  if (file.size > 10 * 1024 * 1024) throw new Error("File too large (max 10 MB)");

  const admin = createSupabaseAdminClient();

  // Upload the raw file so we keep a record; bucket auto-created on first upload.
  const storagePath = `${parsed.orgId}/${Date.now()}-${file.name}`;
  const bucket = admin.storage.from("knowledge");
  const arrayBuf = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuf);
  const { error: upErr } = await bucket.upload(storagePath, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (upErr && !/Bucket not found/i.test(upErr.message)) throw new Error(upErr.message);
  if (upErr) {
    await admin.storage.createBucket("knowledge", { public: false });
    const { error: retry } = await bucket.upload(storagePath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (retry) throw new Error(retry.message);
  }

  const { data: doc, error: docErr } = await admin
    .from("knowledge_documents")
    .insert({
      org_id: parsed.orgId,
      title: parsed.title,
      storage_path: storagePath,
      status: "processing",
    })
    .select("id")
    .single();
  if (docErr || !doc) throw new Error(docErr?.message ?? "Failed to create document");

  try {
    const text = await extractText(file, bytes);
    await admin.from("knowledge_documents").update({ content: text }).eq("id", doc.id);
    const chunks = chunkText(text);
    for (const content of chunks) {
      const embedding = await embedText(parsed.orgId, content);
      const { error } = await admin.from("knowledge_chunks").insert({
        document_id: doc.id,
        org_id: parsed.orgId,
        content,
        embedding,
      });
      if (error) throw new Error(error.message);
    }
    await admin.from("knowledge_documents").update({ status: "ready" }).eq("id", doc.id);
  } catch (err) {
    await admin
      .from("knowledge_documents")
      .update({ status: "error", error: (err as Error).message })
      .eq("id", doc.id);
    throw err;
  }

  revalidatePath(`/app/${parsed.orgId}/knowledge`);
}

async function extractText(file: File, bytes: Uint8Array): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) {
    // pdf-parse is CommonJS; import dynamically so it only loads on the server.
    const mod = await import("pdf-parse");
    const pdfParse = (mod as unknown as { default: (buf: Buffer) => Promise<{ text: string }> })
      .default;
    const res = await pdfParse(Buffer.from(bytes));
    return res.text;
  }
  // Treat everything else as UTF-8 text (md, txt, csv).
  return new TextDecoder("utf-8").decode(bytes);
}

const UpdateSchema = z.object({
  orgId: z.string().uuid(),
  documentId: z.string().uuid(),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(500_000),
});

/**
 * Update a document's title and/or content. Re-chunks and re-embeds when
 * the content changes so the AI's retrievable knowledge reflects the edit.
 */
export async function updateKnowledgeDoc(formData: FormData) {
  const parsed = UpdateSchema.parse({
    orgId: formData.get("orgId"),
    documentId: formData.get("documentId"),
    title: formData.get("title"),
    content: formData.get("content"),
  });
  const ctx = await requireOrgMember(parsed.orgId);
  if (ctx.role !== "owner") throw new Error("Only owners can edit knowledge");
  const admin = createSupabaseAdminClient();

  const { data: existing, error: readErr } = await admin
    .from("knowledge_documents")
    .select("id, title, content")
    .eq("id", parsed.documentId)
    .eq("org_id", parsed.orgId)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!existing) throw new Error("Document not found");

  const titleChanged = existing.title !== parsed.title;
  const contentChanged = (existing.content ?? "") !== parsed.content;

  if (!titleChanged && !contentChanged) {
    revalidatePath(`/app/${parsed.orgId}/knowledge`);
    revalidatePath(`/app/${parsed.orgId}/knowledge/${parsed.documentId}`);
    redirect(`/app/${parsed.orgId}/knowledge/${parsed.documentId}?saved=nochange`);
  }

  await admin
    .from("knowledge_documents")
    .update({
      title: parsed.title,
      content: parsed.content,
      status: contentChanged ? "processing" : existing.content ? "ready" : "ready",
      error: null,
    })
    .eq("id", parsed.documentId);

  if (contentChanged) {
    // Wipe old chunks + regenerate.
    const { error: delErr } = await admin
      .from("knowledge_chunks")
      .delete()
      .eq("document_id", parsed.documentId);
    if (delErr) throw new Error(delErr.message);

    try {
      const chunks = chunkText(parsed.content);
      for (const content of chunks) {
        const embedding = await embedText(parsed.orgId, content);
        const { error } = await admin.from("knowledge_chunks").insert({
          document_id: parsed.documentId,
          org_id: parsed.orgId,
          content,
          embedding,
        });
        if (error) throw new Error(error.message);
      }
      await admin
        .from("knowledge_documents")
        .update({ status: "ready" })
        .eq("id", parsed.documentId);
    } catch (err) {
      await admin
        .from("knowledge_documents")
        .update({ status: "error", error: (err as Error).message })
        .eq("id", parsed.documentId);
      throw err;
    }
  }

  revalidatePath(`/app/${parsed.orgId}/knowledge`);
  revalidatePath(`/app/${parsed.orgId}/knowledge/${parsed.documentId}`);
  const flag = contentChanged ? "reembedded" : "title";
  redirect(`/app/${parsed.orgId}/knowledge/${parsed.documentId}?saved=${flag}`);
}

const DeleteSchema = z.object({
  orgId: z.string().uuid(),
  documentId: z.string().uuid(),
});

export async function deleteKnowledgeDoc(formData: FormData) {
  const parsed = DeleteSchema.parse({
    orgId: formData.get("orgId"),
    documentId: formData.get("documentId"),
  });
  const ctx = await requireOrgMember(parsed.orgId);
  if (ctx.role !== "owner") throw new Error("Only owners can delete knowledge");
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("knowledge_documents")
    .delete()
    .eq("id", parsed.documentId)
    .eq("org_id", parsed.orgId);
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${parsed.orgId}/knowledge`);
  redirect(`/app/${parsed.orgId}/knowledge`);
}
