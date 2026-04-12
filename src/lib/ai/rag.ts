import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { embedText } from "./openai";

export async function retrieveContext(orgId: string, query: string, limit = 5): Promise<string[]> {
  const embedding = await embedText(orgId, query);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("match_knowledge_chunks", {
    p_org_id: orgId,
    p_query: embedding,
    p_limit: limit,
  });
  if (error) {
    console.error("[rag] retrieval failed", error);
    return [];
  }
  return (data ?? []).map((row: { content: string }) => row.content);
}

/**
 * Split raw text into overlapping chunks by characters. Good enough for v1;
 * swap for a token-aware splitter later if quality matters.
 */
export function chunkText(text: string, size = 1200, overlap = 150): string[] {
  const cleaned = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (cleaned.length <= size) return [cleaned];
  const chunks: string[] = [];
  let i = 0;
  while (i < cleaned.length) {
    const end = Math.min(cleaned.length, i + size);
    chunks.push(cleaned.slice(i, end));
    if (end >= cleaned.length) break;
    i = end - overlap;
  }
  return chunks;
}
