import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { embedText, rawChatCompletion } from "./openai";

const NON_LATIN =
  /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿一-鿿぀-ヿЀ-ӿ֐-׿]/;

/**
 * If the query contains non-Latin characters (Arabic, CJK, Cyrillic, Hebrew,
 * etc.), translate it to English before embedding so it matches English KB
 * chunks via semantic similarity. Returns both the translated and original
 * text concatenated so the embedding captures both languages. Falls back to
 * the original query on any translation error.
 */
async function expandCrossLingualQuery(orgId: string, query: string): Promise<string> {
  if (!NON_LATIN.test(query)) return query;
  try {
    const translated = await rawChatCompletion({
      orgId,
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 200,
      messages: [
        {
          role: "system",
          content:
            "Translate the user's message to clear, standard English. Preserve medical, service, or business terminology accurately. Reply with ONLY the English translation — no prose, no quotes, no explanation.",
        },
        { role: "user", content: query },
      ],
    });
    const clean = (translated ?? "").trim();
    if (!clean) return query;
    // Return both for richer cross-lingual embedding.
    return `${clean}\n${query}`;
  } catch {
    return query;
  }
}

export async function retrieveContext(orgId: string, query: string, limit = 5): Promise<string[]> {
  const expanded = await expandCrossLingualQuery(orgId, query);
  const embedding = await embedText(orgId, expanded);
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
