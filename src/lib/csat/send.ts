import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendOutbound } from "@/lib/channels/router";

/**
 * Send a CSAT prompt to a contact after their conversation is resolved.
 * The message asks them to reply with a number 1-5.
 */
export async function sendCsatPrompt(conversationId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data: convo } = await admin
    .from("conversations")
    .select("id, org_id, contact_external_id")
    .eq("id", conversationId)
    .single();
  if (!convo) return;

  const text =
    "We'd love your feedback! How would you rate your experience? Reply with a number:\n\n" +
    "1 - Very poor\n2 - Poor\n3 - Okay\n4 - Good\n5 - Excellent";

  try {
    const { platformMessageId } = await sendOutbound({ conversationId, text });
    await admin.from("messages").insert({
      org_id: convo.org_id,
      conversation_id: conversationId,
      direction: "out",
      sender: "ai",
      content: text,
      platform_message_id: platformMessageId ?? null,
    });
  } catch (err) {
    console.error("[csat] failed to send prompt", err);
  }
}

/**
 * Check if an inbound message is a CSAT rating response (1-5) for a recently
 * resolved conversation. If so, save the rating.
 */
export async function checkForCsatResponse(params: {
  orgId: string;
  conversationId: string;
  contactExternalId: string;
  text: string;
}): Promise<boolean> {
  const num = parseInt(params.text.trim(), 10);
  if (isNaN(num) || num < 1 || num > 5) return false;

  const admin = createSupabaseAdminClient();
  const { data: convo } = await admin
    .from("conversations")
    .select("status")
    .eq("id", params.conversationId)
    .single();

  // Only accept CSAT if the conversation was resolved (the prompt was sent).
  if (convo?.status !== "resolved") return false;

  // Check no existing rating.
  const { data: existing } = await admin
    .from("csat_ratings")
    .select("id")
    .eq("conversation_id", params.conversationId)
    .maybeSingle();
  if (existing) return false;

  await admin.from("csat_ratings").insert({
    org_id: params.orgId,
    conversation_id: params.conversationId,
    contact_external_id: params.contactExternalId,
    rating: num,
  });

  // Send thank you.
  try {
    await sendOutbound({
      conversationId: params.conversationId,
      text: "Thank you for your feedback! We appreciate it.",
    });
  } catch {}

  return true;
}
