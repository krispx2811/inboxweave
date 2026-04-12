import "server-only";
import { getOpenAIForOrg } from "./openai";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface SentimentResult {
  sentiment: "positive" | "neutral" | "negative" | "angry";
  score: number; // -1.0 to 1.0
  shouldEscalate: boolean;
}

export async function analyzeSentiment(orgId: string, text: string): Promise<SentimentResult> {
  const client = await getOpenAIForOrg(orgId);
  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    max_tokens: 60,
    messages: [
      {
        role: "system",
        content: `Analyze the sentiment of the customer message. Reply with ONLY valid JSON:
{"sentiment":"positive|neutral|negative|angry","score":<float -1.0 to 1.0>,"shouldEscalate":<bool>}
Escalate if the customer is angry, threatening, or expressing serious dissatisfaction.`,
      },
      { role: "user", content: text },
    ],
  });
  const raw = res.choices[0]?.message?.content?.trim() ?? "";
  try {
    const parsed = JSON.parse(raw) as SentimentResult;
    return {
      sentiment: parsed.sentiment || "neutral",
      score: typeof parsed.score === "number" ? parsed.score : 0,
      shouldEscalate: Boolean(parsed.shouldEscalate),
    };
  } catch {
    return { sentiment: "neutral", score: 0, shouldEscalate: false };
  }
}

export async function generateSummary(orgId: string, conversationId: string): Promise<string> {
  const admin = createSupabaseAdminClient();
  const { data: messages } = await admin
    .from("messages")
    .select("direction, sender, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(50);

  if (!messages || messages.length < 2) return "Too few messages to summarize.";

  const transcript = messages
    .map((m) => `${m.direction === "in" ? "Customer" : m.sender === "ai" ? "AI" : "Agent"}: ${m.content}`)
    .join("\n");

  const client = await getOpenAIForOrg(orgId);
  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: 200,
    messages: [
      {
        role: "system",
        content: "Summarize this customer support conversation in 2-3 sentences. Focus on: what the customer wanted, what was resolved, and any outstanding issues.",
      },
      { role: "user", content: transcript },
    ],
  });
  return res.choices[0]?.message?.content?.trim() ?? "";
}

export async function generateSuggestedReplies(
  orgId: string,
  conversationId: string,
): Promise<string[]> {
  const admin = createSupabaseAdminClient();
  const [{ data: messages }, { data: settings }] = await Promise.all([
    admin
      .from("messages")
      .select("direction, sender, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(8),
    admin.from("ai_settings").select("system_prompt").eq("org_id", orgId).maybeSingle(),
  ]);

  if (!messages || messages.length === 0) return [];

  const recent = messages.reverse();
  const transcript = recent
    .map((m) => `${m.direction === "in" ? "Customer" : "Agent"}: ${m.content}`)
    .join("\n");

  const client = await getOpenAIForOrg(orgId);
  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.7,
    max_tokens: 300,
    messages: [
      {
        role: "system",
        content: `You are a customer support assistant. ${settings?.system_prompt ?? ""}
Given this conversation, suggest exactly 3 short reply options the agent could send.
Reply with ONLY a JSON array of 3 strings. Example: ["reply 1","reply 2","reply 3"]`,
      },
      { role: "user", content: transcript },
    ],
  });

  const raw = res.choices[0]?.message?.content?.trim() ?? "[]";
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.slice(0, 3).map(String);
  } catch {}
  return [];
}
