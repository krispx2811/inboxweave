import "server-only";
import { decryptSecret, pgByteaToBuffer } from "@/lib/crypto/secrets";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  BACKGROUND_MODEL,
  DEFAULT_MODEL,
  chatRequestBody,
  classifyOpenAIError,
  modelFallbackChain,
  modelPricing,
} from "./models";
import type { LiveOffer } from "./offer-format";
import { buildReplyMessages, type ChatTurn } from "./reply-prompt";

const OPENAI_BASE = "https://api.openai.com/v1";

// One inbound message makes several OpenAI calls (language, sentiment,
// classification, translation, embedding, reply), and each used to re-read and
// decrypt the key. Cache it briefly per warm function instance: long enough to
// cover one message's calls, short enough that a re-saved key on another
// instance takes over quickly. Saving a key, or a 401, evicts it at once.
const KEY_TTL_MS = 60_000;
const keyCache = new Map<string, { key: string; expires: number }>();

export function forgetOpenAIKey(orgId: string): void {
  keyCache.delete(orgId);
}

// Models OpenAI rejected recently, keyed by API key + model (one org's key
// lacking a model says nothing about another's), so each reply doesn't pay
// for a failed attempt before falling back. Expired entries are removed on read.
const REJECTED_TTL_MS = 10 * 60_000;
const rejectedModels = new Map<string, number>();
// Tuning parameters each model has refused; left out of its requests from then on.
const refusedParams = new Map<string, Set<string>>();

function recentlyRejected(apiKey: string, model: string, now: number): boolean {
  const key = `${apiKey}:${model}`;
  const until = rejectedModels.get(key);
  if (until === undefined) return false;
  if (until > now) return true;
  rejectedModels.delete(key);
  return false;
}

/**
 * Fetch + decrypt the OpenAI key for a specific org.
 * We use raw fetch (not the OpenAI SDK) to avoid accidentally inheriting
 * stray OPENAI_ORG_ID / OPENAI_PROJECT / OPENAI_BASE_URL env vars that
 * would cause 401s on project-scoped (sk-proj-*) keys.
 */
export async function getOpenAIKeyForOrg(orgId: string): Promise<string> {
  const cached = keyCache.get(orgId);
  if (cached && cached.expires > Date.now()) return cached.key;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("org_secrets")
    .select("openai_api_key_ciphertext")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw new Error(`org_secrets query failed: ${error.message}`);
  if (!data?.openai_api_key_ciphertext) {
    throw new Error(`Org ${orgId} has no OpenAI API key configured`);
  }
  const raw = data.openai_api_key_ciphertext as unknown;
  const buf = pgByteaToBuffer(raw as string | Buffer | Uint8Array);
  if (buf.length < 29) {
    throw new Error(`ciphertext too short for org ${orgId}: ${buf.length} bytes`);
  }
  const apiKey = decryptSecret(buf).trim();
  if (!apiKey.startsWith("sk-")) {
    throw new Error(`decrypted key invalid — re-save the OpenAI key in Settings`);
  }
  keyCache.set(orgId, { key: apiKey, expires: Date.now() + KEY_TTL_MS });
  return apiKey;
}

export interface AiSettings {
  system_prompt: string;
  model: string;
  temperature: number;
}

export async function getAiSettings(orgId: string): Promise<AiSettings> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("ai_settings")
    .select("system_prompt, model, temperature")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (
    data ?? {
      system_prompt:
        "You are a helpful customer support assistant. Be concise, friendly, and accurate.",
      model: DEFAULT_MODEL,
      // Default to 0 to prevent hallucinating numbers/contact info. Orgs can
      // raise this per-org if they want more creative replies.
      temperature: 0,
    }
  );
}

/**
 * Org-wide AI master switch (the dashboard kill switch). Returns true when the
 * AI is allowed to auto-reply for this org. Defaults to true when no settings
 * row exists yet, so the AI is on by default for new orgs.
 */
export async function isOrgAiEnabled(orgId: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  // select("*") rather than naming the column: before migration 0017 the
  // column simply isn't in the row (reads as on) instead of failing the query.
  // Real errors still throw, so the kill switch stays authoritative.
  const { data, error } = await admin
    .from("ai_settings")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  // Treat a missing row or a null/missing column as "on".
  return (data as { ai_enabled?: boolean | null } | null)?.ai_enabled !== false;
}

export type { ChatTurn };


interface ChatCompletionResult {
  choices: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
  /** The model that actually answered (may be a fallback). */
  usedModel: string;
}

/**
 * One model's attempt. A tuning parameter the model refuses is dropped, and
 * the same model retried, at most once per such parameter.
 */
async function postChat(params: {
  apiKey: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
  messages: unknown[];
}) {
  const refused = refusedParams.get(params.model) ?? new Set<string>();
  for (;;) {
    const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chatRequestBody({ ...params, omit: refused })),
    });
    const text = await res.text();
    const error = res.ok ? null : classifyOpenAIError(res.status, text);
    if (error?.kind === "param" && !refused.has(error.param)) {
      refused.add(error.param);
      refusedParams.set(params.model, refused);
      continue;
    }
    return { status: res.status, text, error };
  }
}

/**
 * Low-level chat completion via direct fetch (no SDK).
 * Only a rejection of the model itself (shut down, not on this key) moves on
 * to the next model in the fallback chain; `usedModel` says which answered.
 * A problem with the request (bad image URL, prompt too long) or any other
 * failure throws with the error body.
 */
export async function chatCompletion(params: {
  apiKey: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
  messages: Array<{ role: string; content: unknown }>;
}): Promise<ChatCompletionResult> {
  const now = Date.now();
  const fullChain = modelFallbackChain(params.model);
  const healthy = fullChain.filter((m) => !recentlyRejected(params.apiKey, m, now));
  // Never skip everything: if all were rejected recently, try them all again.
  const chain = healthy.length > 0 ? healthy : fullChain;
  let lastError: Error | undefined;
  for (const model of chain) {
    const res = await postChat({ ...params, model });
    if (!res.error) {
      return { ...(JSON.parse(res.text) as Omit<ChatCompletionResult, "usedModel">), usedModel: model };
    }
    if (res.status === 401) {
      for (const [orgId, entry] of keyCache) if (entry.key === params.apiKey) keyCache.delete(orgId);
    }
    lastError = new Error(`OpenAI chat ${res.status} (${model}): ${res.text.slice(0, 300)}`);
    if (res.error.kind !== "model") throw lastError;
    rejectedModels.set(`${params.apiKey}:${model}`, Date.now() + REJECTED_TTL_MS);
    console.warn(`[ai] ${model} rejected (${res.status}): ${res.text.slice(0, 200)}`);
  }
  throw lastError!;
}

async function logUsage(params: {
  orgId: string;
  conversationId?: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
}) {
  const total = params.promptTokens + params.completionTokens;
  const rate = modelPricing(params.model);
  const cost =
    (params.promptTokens * rate.prompt + params.completionTokens * rate.completion) / 1_000_000;
  const admin = createSupabaseAdminClient();
  await admin
    .from("usage_logs")
    .insert({
      org_id: params.orgId,
      conversation_id: params.conversationId ?? null,
      model: params.model,
      prompt_tokens: params.promptTokens,
      completion_tokens: params.completionTokens,
      total_tokens: total,
      cost_usd: Math.round(cost * 1_000_000) / 1_000_000,
    })
    .then(() => {});
}

export async function generateReply(params: {
  orgId: string;
  conversationId?: string;
  userMessage: string;
  history: ChatTurn[];
  retrievedContext: string[];
  contactMemory?: string[];
  priorSummary?: string;
  replyInLanguage?: string;
  /** Already-loaded AI settings, so the caller can fetch them in parallel. */
  settings?: AiSettings;
  /** Offers running right now; they override the knowledge base. */
  offers?: LiveOffer[];
}): Promise<string> {
  const [apiKey, settings] = await Promise.all([
    getOpenAIKeyForOrg(params.orgId),
    params.settings ?? getAiSettings(params.orgId),
  ]);

  const model = settings.model || DEFAULT_MODEL;
  const result = await chatCompletion({
    apiKey,
    model,
    temperature: settings.temperature,
    messages: buildReplyMessages({
      systemPrompt: settings.system_prompt,
      userMessage: params.userMessage,
      history: params.history,
      retrievedContext: params.retrievedContext,
      contactMemory: params.contactMemory,
      priorSummary: params.priorSummary,
      replyInLanguage: params.replyInLanguage,
      offers: params.offers,
    }),
  });

  if (result.usage) {
    logUsage({
      orgId: params.orgId,
      conversationId: params.conversationId,
      model: result.usedModel,
      promptTokens: result.usage.prompt_tokens,
      completionTokens: result.usage.completion_tokens,
    }).catch(() => {});
  }

  return result.choices[0]?.message?.content?.trim() ?? "";
}

export async function detectLanguage(orgId: string, text: string): Promise<string | null> {
  if (text.length < 10) return null;
  const apiKey = await getOpenAIKeyForOrg(orgId);
  const result = await chatCompletion({
    apiKey,
    model: BACKGROUND_MODEL,
    temperature: 0,
    max_tokens: 10,
    messages: [
      {
        role: "system",
        content:
          "Detect the language of the user message. Reply with ONLY the ISO 639-1 code (e.g. en, ar, es, fr, de). Nothing else.",
      },
      { role: "user", content: text },
    ],
  });
  const lang = result.choices[0]?.message?.content?.trim().toLowerCase().slice(0, 5);
  if (lang && /^[a-z]{2}(-[a-z]{2})?$/.test(lang)) return lang;
  return null;
}

export async function embedText(orgId: string, text: string): Promise<number[]> {
  const apiKey = await getOpenAIKeyForOrg(orgId);
  const res = await fetch(`${OPENAI_BASE}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`OpenAI embeddings ${res.status}: ${body.slice(0, 300)}`);
  const json = JSON.parse(body) as { data: Array<{ embedding: number[] }> };
  return json.data[0]!.embedding;
}

/** Shared helper for other modules that still need the raw chat API. */
export async function rawChatCompletion(params: {
  orgId: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  messages: Array<{ role: string; content: string }>;
}): Promise<string> {
  const apiKey = await getOpenAIKeyForOrg(params.orgId);
  const result = await chatCompletion({
    apiKey,
    model: params.model ?? BACKGROUND_MODEL,
    temperature: params.temperature,
    max_tokens: params.max_tokens,
    messages: params.messages,
  });
  return result.choices[0]?.message?.content?.trim() ?? "";
}
