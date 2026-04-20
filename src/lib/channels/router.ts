import "server-only";
import { decryptSecret, pgByteaToBuffer } from "@/lib/crypto/secrets";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ChannelPlatform } from "@/lib/supabase/types";
import { sendWhatsAppText } from "./whatsapp";
import { sendMessengerText } from "./messenger";
import { sendInstagramText } from "./instagram";
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
    // Clear any stale error state on success.
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
