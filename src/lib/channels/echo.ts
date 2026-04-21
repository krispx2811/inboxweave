import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ChannelPlatform } from "@/lib/supabase/types";
import {
  detectStopStart,
  primaryLanguage,
  startConfirmation,
  stopConfirmation,
} from "./commands";
import { sendOutbound } from "./router";

export interface OwnerEcho {
  platform: ChannelPlatform;
  channelExternalId: string;
  contactExternalId: string;
  text: string;
  platformMessageId?: string;
}

/**
 * Handle a message the business owner sent directly from the Instagram (or
 * Messenger) app — delivered to us as `is_echo=true` on the webhook.
 *
 * Behaviour:
 *  - Persist the text in messages as sender='human' so it shows up in the
 *    inbox thread alongside AI + customer messages.
 *  - Bump the conversation's last_message_at.
 *  - If the owner typed just "stop" / "start" (English or Arabic variants),
 *    toggle ai_enabled for the conversation AND send the localized
 *    confirmation message to the customer so they know what changed.
 *  - If the command's state is unchanged (owner retypes "stop" when AI is
 *    already paused), no confirmation is sent.
 */
export async function handleOwnerEcho(msg: OwnerEcho): Promise<void> {
  const admin = createSupabaseAdminClient();

  const { data: channel } = await admin
    .from("channels")
    .select("id, org_id, status")
    .eq("platform", msg.platform)
    .eq("external_id", msg.channelExternalId)
    .maybeSingle();
  if (!channel) return;

  const orgId = channel.org_id as string;

  const { data: convo } = await admin
    .from("conversations")
    .upsert(
      {
        org_id: orgId,
        channel_id: channel.id,
        contact_external_id: msg.contactExternalId,
        last_message_at: new Date().toISOString(),
      },
      { onConflict: "channel_id,contact_external_id" },
    )
    .select("id, ai_enabled, language")
    .single();
  if (!convo) return;

  const command = detectStopStart(msg.text);

  // Check if we already persisted this echo (Meta occasionally re-delivers).
  if (msg.platformMessageId) {
    const { data: dup } = await admin
      .from("messages")
      .select("id")
      .eq("platform_message_id", msg.platformMessageId)
      .maybeSingle();
    if (dup) return;
  }

  // Record the owner's message in the inbox thread.
  await admin.from("messages").insert({
    org_id: orgId,
    conversation_id: convo.id,
    direction: "out",
    sender: "human",
    content: msg.text,
    platform_message_id: msg.platformMessageId ?? null,
  });

  if (!command) return;

  // Owner typed stop/start. Toggle + optionally confirm to customer.
  const enabled = command === "start";
  const alreadyInState = convo.ai_enabled === enabled;
  const lang: "ar" | "en" = primaryLanguage(
    msg.text,
    (convo.language as "ar" | "en") ?? "en",
  );

  await admin
    .from("conversations")
    .update({ ai_enabled: enabled })
    .eq("id", convo.id);

  if (!alreadyInState) {
    const confirmation = enabled ? startConfirmation(lang) : stopConfirmation(lang);
    try {
      const { platformMessageId } = await sendOutbound({
        conversationId: convo.id as string,
        text: confirmation,
      });
      await admin.from("messages").insert({
        org_id: orgId,
        conversation_id: convo.id,
        direction: "out",
        sender: "ai",
        content: confirmation,
        platform_message_id: platformMessageId ?? null,
      });
    } catch (err) {
      console.error("[echo] stop/start confirmation send failed", err);
    }
  }

  await admin.from("audit_logs").insert({
    org_id: orgId,
    action: enabled ? "ai_enabled" : "ai_disabled",
    payload: {
      conversation_id: convo.id,
      reason: "owner_echo_command",
      language: lang,
      already_in_state: alreadyInState,
      channel: msg.platform,
    },
  });
}
