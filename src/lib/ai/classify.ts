import "server-only";
import { rawChatCompletion } from "./openai";

export interface Classification {
  category: "pricing" | "booking" | "complaint" | "support" | "feedback" | "other";
  priority: "urgent" | "normal" | "low";
}

/**
 * Lightweight topic + priority classification. Runs in the background on
 * every inbound message so the inbox can auto-tag and prioritize without
 * the agent triaging manually. Uses gpt-4o-mini for cost; falls back to
 * 'other/normal' on any error.
 */
export async function classifyConversation(
  orgId: string,
  text: string,
): Promise<Classification> {
  if (!text || text.length < 3) return { category: "other", priority: "normal" };

  const raw = await rawChatCompletion({
    orgId,
    model: "gpt-4o-mini",
    temperature: 0,
    max_tokens: 60,
    messages: [
      {
        role: "system",
        content: `Classify the customer message. Reply with ONLY valid JSON, no prose:
{"category":"pricing|booking|complaint|support|feedback|other","priority":"urgent|normal|low"}

Rules for priority:
- "urgent" = angry/abusive tone, billing/payment dispute, medical urgency, threats to leave, legal mention
- "low"    = generic greeting ("hi"), thank-yous, pure chit-chat
- "normal" = anything else`,
      },
      { role: "user", content: text.slice(0, 1500) },
    ],
  }).catch(() => "");

  try {
    const parsed = JSON.parse(raw) as Partial<Classification>;
    const category =
      (parsed.category as Classification["category"]) ?? "other";
    const priority =
      (parsed.priority as Classification["priority"]) ?? "normal";
    return { category, priority };
  } catch {
    return { category: "other", priority: "normal" };
  }
}
