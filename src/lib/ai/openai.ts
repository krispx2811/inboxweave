import "server-only";
import { decryptSecret, pgByteaToBuffer } from "@/lib/crypto/secrets";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// GPT-4o-mini pricing per 1M tokens (USD).
const PRICING: Record<string, { prompt: number; completion: number }> = {
  "gpt-4o-mini": { prompt: 0.15, completion: 0.6 },
  "gpt-4o": { prompt: 5.0, completion: 15.0 },
  "gpt-4.1-mini": { prompt: 0.4, completion: 1.6 },
  "gpt-4.1": { prompt: 2.0, completion: 8.0 },
  "gpt-4.1-nano": { prompt: 0.1, completion: 0.4 },
};

const OPENAI_BASE = "https://api.openai.com/v1";

/**
 * Fetch + decrypt the OpenAI key for a specific org.
 * We use raw fetch (not the OpenAI SDK) to avoid accidentally inheriting
 * stray OPENAI_ORG_ID / OPENAI_PROJECT / OPENAI_BASE_URL env vars that
 * would cause 401s on project-scoped (sk-proj-*) keys.
 */
export async function getOpenAIKeyForOrg(orgId: string): Promise<string> {
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
      model: "gpt-4o-mini",
      temperature: 0.3,
    }
  );
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

interface ChatCompletionResult {
  choices: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

/**
 * Low-level chat completion via direct fetch (no SDK).
 * Throws with the full error body on non-2xx responses.
 */
async function chatCompletion(params: {
  apiKey: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
  messages: Array<{ role: string; content: string }>;
}): Promise<ChatCompletionResult> {
  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      temperature: params.temperature,
      max_tokens: params.max_tokens,
      messages: params.messages,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI chat ${res.status}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as ChatCompletionResult;
}

async function logUsage(params: {
  orgId: string;
  conversationId?: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
}) {
  const total = params.promptTokens + params.completionTokens;
  const rate = PRICING[params.model] ?? PRICING["gpt-4o-mini"]!;
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
  replyInLanguage?: string;
}): Promise<string> {
  const apiKey = await getOpenAIKeyForOrg(params.orgId);
  const settings = await getAiSettings(params.orgId);

  const contextBlock =
    params.retrievedContext.length > 0
      ? `\n\nYou have access to the following knowledge about this business. Use it when relevant; do not invent facts beyond it:\n---\n${params.retrievedContext.join("\n---\n")}\n---`
      : "";

  const languageInstruction = params.replyInLanguage
    ? `\n\nIMPORTANT: Always reply in ${params.replyInLanguage}. Match the customer's language.`
    : "\n\nIMPORTANT: Detect the customer's language and always reply in the same language they use.";

  const contextInstruction =
    "\n\nIMPORTANT: Read the entire conversation history carefully before replying. " +
    "Treat short or vague follow-up messages (e.g. 'its for lasik', 'yes', 'how much?', " +
    "'the second one') as continuations of the previous topic — use what the customer " +
    "said earlier to resolve what they're asking about now. If context is genuinely " +
    "ambiguous, ask one clarifying question instead of guessing.";

  const model = settings.model || "gpt-4o-mini";
  const result = await chatCompletion({
    apiKey,
    model,
    temperature: settings.temperature,
    messages: [
      { role: "system", content: settings.system_prompt + contextBlock + languageInstruction + contextInstruction },
      ...params.history.map((h) => ({ role: h.role, content: h.content })),
      { role: "user", content: params.userMessage },
    ],
  });

  if (result.usage) {
    logUsage({
      orgId: params.orgId,
      conversationId: params.conversationId,
      model,
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
    model: "gpt-4o-mini",
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
    model: params.model ?? "gpt-4o-mini",
    temperature: params.temperature,
    max_tokens: params.max_tokens,
    messages: params.messages,
  });
  return result.choices[0]?.message?.content?.trim() ?? "";
}
