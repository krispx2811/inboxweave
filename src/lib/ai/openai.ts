import "server-only";
import OpenAI from "openai";
import { decryptSecret, pgByteaToBuffer } from "@/lib/crypto/secrets";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// GPT-4o-mini pricing per 1M tokens (as of 2024-07).
const PRICING: Record<string, { prompt: number; completion: number }> = {
  "gpt-4o-mini": { prompt: 0.15, completion: 0.6 },
  "gpt-4o": { prompt: 5.0, completion: 15.0 },
};

export async function getOpenAIForOrg(orgId: string): Promise<OpenAI> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("org_secrets")
    .select("openai_api_key_ciphertext")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.openai_api_key_ciphertext) {
    throw new Error(`Org ${orgId} has no OpenAI API key configured`);
  }
  const buf = pgByteaToBuffer(data.openai_api_key_ciphertext as unknown as string);
  const apiKey = decryptSecret(buf);
  return new OpenAI({ apiKey });
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

async function logUsage(params: {
  orgId: string;
  conversationId?: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
}) {
  const total = params.promptTokens + params.completionTokens;
  const rate = PRICING[params.model] ?? PRICING["gpt-4o-mini"]!;
  const cost = (params.promptTokens * rate.prompt + params.completionTokens * rate.completion) / 1_000_000;
  const admin = createSupabaseAdminClient();
  await admin.from("usage_logs").insert({
    org_id: params.orgId,
    conversation_id: params.conversationId ?? null,
    model: params.model,
    prompt_tokens: params.promptTokens,
    completion_tokens: params.completionTokens,
    total_tokens: total,
    cost_usd: Math.round(cost * 1_000_000) / 1_000_000,
  }).then(() => {});
}

export async function generateReply(params: {
  orgId: string;
  conversationId?: string;
  userMessage: string;
  history: ChatTurn[];
  retrievedContext: string[];
  replyInLanguage?: string;
}): Promise<string> {
  const client = await getOpenAIForOrg(params.orgId);
  const settings = await getAiSettings(params.orgId);

  const contextBlock =
    params.retrievedContext.length > 0
      ? `\n\nYou have access to the following knowledge about this business. Use it when relevant; do not invent facts beyond it:\n---\n${params.retrievedContext.join("\n---\n")}\n---`
      : "";

  const languageInstruction = params.replyInLanguage
    ? `\n\nIMPORTANT: Always reply in ${params.replyInLanguage}. Match the customer's language.`
    : "\n\nIMPORTANT: Detect the customer's language and always reply in the same language they use.";

  const model = settings.model || "gpt-4o-mini";
  const completion = await client.chat.completions.create({
    model,
    temperature: settings.temperature,
    messages: [
      { role: "system", content: settings.system_prompt + contextBlock + languageInstruction },
      ...params.history.map((h) => ({ role: h.role, content: h.content })),
      { role: "user", content: params.userMessage },
    ],
  });

  const usage = completion.usage;
  if (usage) {
    logUsage({
      orgId: params.orgId,
      conversationId: params.conversationId,
      model,
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
    }).catch(() => {});
  }

  return completion.choices[0]?.message?.content?.trim() ?? "";
}

export async function detectLanguage(orgId: string, text: string): Promise<string | null> {
  if (text.length < 10) return null;
  const client = await getOpenAIForOrg(orgId);
  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    max_tokens: 10,
    messages: [
      { role: "system", content: "Detect the language of the user message. Reply with ONLY the ISO 639-1 code (e.g. en, ar, es, fr, de). Nothing else." },
      { role: "user", content: text },
    ],
  });
  const lang = res.choices[0]?.message?.content?.trim().toLowerCase().slice(0, 5);
  if (lang && /^[a-z]{2}(-[a-z]{2})?$/.test(lang)) return lang;
  return null;
}

export async function embedText(orgId: string, text: string): Promise<number[]> {
  const client = await getOpenAIForOrg(orgId);
  const res = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return res.data[0]!.embedding;
}
