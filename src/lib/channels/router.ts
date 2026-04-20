import "server-only";
import { decryptSecret, pgByteaToBuffer } from "@/lib/crypto/secrets";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ChannelPlatform } from "@/lib/supabase/types";
import { sendWhatsAppText } from "./whatsapp";
import { sendMessengerSenderAction, sendMessengerText } from "./messenger";
import { sendInstagramSenderAction, sendInstagramText } from "./instagram";
import { isTokenError, markChannelHealthy, markChannelUnhealthy } from "./health";

/**
 * Unified outbound send. Loads the channel + decrypted access token, then
 * dispatches to the platform-specific sender. Returns the platform message
 * id so callers can persist it.
 */
export async function sendOutbound(params: {
  conversationId: string;
  text: string;
}): Promise<{ platformMessageId?: string; platform: ChannelPlatform }> {
  const admin = createSupabaseAdminClient();

  const { data: convo, error: convErr } = await admin
    .from("conversations")
    .select("id, contact_external_id, channel_id")
    .eq("id", params.conversationId)
    .single();
  if (convErr || !convo) throw new Error("Conversation not found");

  const { data: channel, error: chErr } = await admin
    .from("channels")
    .select("id, org_id, platform, external_id, access_token_ciphertext")
    .eq("id", convo.channel_id)
    .single();
  if (chErr || !channel) throw new Error("Channel not found");

  const token = decryptSecret(
    pgByteaToBuffer(channel.access_token_ciphertext as unknown as string),
  );

  const dispatch = async (): Promise<{ platformMessageId?: string; platform: ChannelPlatform }> => {
    if (channel.platform === "whatsapp") {
      const { messageId } = await sendWhatsAppText({
        phoneNumberId: channel.external_id,
        accessToken: token,
        to: convo.contact_external_id,
        text: params.text,
      });
      return { platformMessageId: messageId, platform: "whatsapp" };
    }
    if (channel.platform === "messenger") {
      const { messageId } = await sendMessengerText({
        pageAccessToken: token,
        recipientPsid: convo.contact_external_id,
        text: params.text,
      });
      return { platformMessageId: messageId, platform: "messenger" };
    }
    if (channel.platform === "instagram") {
      // IG Business Login tokens start with "IGAA"; Page tokens from classic
      // Facebook Login look different. Route to the correct host accordingly.
      const isIgBusinessToken = token.startsWith("IGA");
      const { messageId } = await sendInstagramText({
        pageAccessToken: token,
        recipientId: convo.contact_external_id,
        text: params.text,
        useFacebookGraph: !isIgBusinessToken,
      });
      return { platformMessageId: messageId, platform: "instagram" };
    }
    if (channel.platform === "sms") {
      const { sendSms } = await import("./sms");
      // For SMS, the org_id is needed for Twilio config lookup.
      const { data: convoFull } = await admin
        .from("conversations")
        .select("org_id")
        .eq("id", params.conversationId)
        .single();
      const { messageId } = await sendSms({
        orgId: convoFull?.org_id as string,
        to: convo.contact_external_id,
        text: params.text,
      });
      return { platformMessageId: messageId, platform: "sms" };
    }
    throw new Error(`Unsupported platform: ${channel.platform as string}`);
  };

  try {
    const result = await dispatch();
    markChannelHealthy(channel.id as string).catch(() => {});
    return result;
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    if (isTokenError(msg)) {
      await markChannelUnhealthy({
        channelId: channel.id as string,
        orgId: channel.org_id as string,
        platform: channel.platform as string,
        error: msg,
      }).catch(() => {});
    }
    throw err;
  }
}

/**
 * Show a "typing..." bubble on the conversation's channel (Instagram and
 * Messenger only — WhatsApp and SMS don't support this). All failures are
 * swallowed; this is a cosmetic enhancement, not critical path.
 */
export async function sendTypingIndicator(conversationId: string): Promise<void> {
  const admin = createSupabaseAdminClient();

  const { data: convo } = await admin
    .from("conversations")
    .select("contact_external_id, channel_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!convo) return;

  const { data: channel } = await admin
    .from("channels")
    .select("platform, access_token_ciphertext")
    .eq("id", convo.channel_id)
    .maybeSingle();
  if (!channel) return;

  let token: string;
  try {
    token = decryptSecret(
      pgByteaToBuffer(channel.access_token_ciphertext as unknown as string),
    );
  } catch {
    return;
  }

  if (channel.platform === "instagram") {
    const isIgBusinessToken = token.startsWith("IGA");
    await sendInstagramSenderAction({
      pageAccessToken: token,
      recipientId: convo.contact_external_id as string,
      action: "typing_on",
      useFacebookGraph: !isIgBusinessToken,
    });
    return;
  }
  if (channel.platform === "messenger") {
    await sendMessengerSenderAction({
      pageAccessToken: token,
      recipientPsid: convo.contact_external_id as string,
      action: "typing_on",
    });
    return;
  }
  // whatsapp / sms: no-op.
}
