import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ChannelPlatform } from "@/lib/supabase/types";
import { generateReply, detectLanguage } from "@/lib/ai/openai";
import { retrieveContext } from "@/lib/ai/rag";
import { analyzeSentiment } from "@/lib/ai/analysis";
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatch";
import { sendOutbound } from "./router";

export interface NormalizedInbound {
  platform: ChannelPlatform;
  channelExternalId: string;
  contactExternalId: string;
  contactName?: string;
  text: string;
  platformMessageId?: string;
  mediaUrl?: string;
  mediaType?: string;
  mediaMime?: string;
}

export async function handleInbound(msg: NormalizedInbound): Promise<void> {
  const admin = createSupabaseAdminClient();

  // 1. Resolve channel → org.
  const { data: channel, error: chErr } = await admin
    .from("channels")
    .select("id, org_id, platform, status")
    .eq("platform", msg.platform)
    .eq("external_id", msg.channelExternalId)
    .maybeSingle();
  if (chErr) throw new Error(chErr.message);
  if (!channel) {
    console.warn(`[inbound] no channel for ${msg.platform} external_id=${msg.channelExternalId}; ignoring`);
    return;
  }
  if (channel.status !== "active") return;

  const orgId = channel.org_id as string;

  // 2. Upsert conversation.
  const { data: convo, error: convErr } = await admin
    .from("conversations")
    .upsert(
      {
        org_id: orgId,
        channel_id: channel.id,
        contact_external_id: msg.contactExternalId,
        contact_name: msg.contactName ?? null,
        last_message_at: new Date().toISOString(),
      },
      { onConflict: "channel_id,contact_external_id" },
    )
    .select("id, ai_enabled, language")
    .single();
  if (convErr || !convo) throw new Error(convErr?.message ?? "Failed to upsert conversation");

  // 3. Persist inbound message (with optional media).
  const { error: msgErr } = await admin.from("messages").insert({
    org_id: orgId,
    conversation_id: convo.id,
    direction: "in",
    sender: "contact",
    content: msg.text || (msg.mediaType ? `[${msg.mediaType}]` : "[media]"),
    platform_message_id: msg.platformMessageId ?? null,
    media_url: msg.mediaUrl ?? null,
    media_type: msg.mediaType ?? null,
    media_mime: msg.mediaMime ?? null,
  });
  if (msgErr) throw new Error(msgErr.message);

  // 4. Fire inbound webhook event (non-blocking).
  dispatchWebhookEvent({
    orgId,
    event: "message.inbound",
    payload: { conversation_id: convo.id, contact: msg.contactExternalId, text: msg.text, platform: msg.platform },
  }).catch(() => {});

  // 5. Detect language + sentiment (non-blocking, in parallel).
  let detectedLang = convo.language as string | null;
  if (msg.text && msg.text.length >= 10) {
    const langPromise = !detectedLang
      ? detectLanguage(orgId, msg.text).then((lang) => {
          if (lang) admin.from("conversations").update({ language: lang }).eq("id", convo.id).then(() => {});
        }).catch(() => {})
      : Promise.resolve();

    const sentimentPromise = analyzeSentiment(orgId, msg.text).then(async (result) => {
      const updates: Record<string, unknown> = {
        sentiment: result.sentiment,
        sentiment_score: result.score,
      };
      if (result.shouldEscalate) {
        updates.is_escalated = true;
        updates.escalated_at = new Date().toISOString();
        updates.ai_enabled = false; // Auto-pause AI on escalation.
        dispatchWebhookEvent({
          orgId,
          event: "conversation.escalated",
          payload: { conversation_id: convo.id, sentiment: result.sentiment, score: result.score },
        }).catch(() => {});
      }
      await admin.from("conversations").update(updates).eq("id", convo.id);
    }).catch(() => {});

    // Don't await these — fire and forget.
    void langPromise;
    void sentimentPromise;
  }

  // 6. AI reply, if enabled and there is text.
  if (!convo.ai_enabled || !msg.text) return;

  try {
    const { data: history } = await admin
      .from("messages")
      .select("direction, sender, content, created_at")
      .eq("conversation_id", convo.id)
      .order("created_at", { ascending: false })
      .limit(12);

    const turns = (history ?? [])
      .reverse()
      .slice(0, -1)
      .map((m) => ({
        role: m.direction === "in" ? ("user" as const) : ("assistant" as const),
        content: m.content as string,
      }));

    const context = await retrieveContext(orgId, msg.text).catch(() => []);
    const reply = await generateReply({
      orgId,
      conversationId: convo.id as string,
      userMessage: msg.text,
      history: turns,
      retrievedContext: context,
      replyInLanguage: detectedLang ?? undefined,
    });

    if (!reply) return;

    const { platformMessageId } = await sendOutbound({ conversationId: convo.id, text: reply });

    await admin.from("messages").insert({
      org_id: orgId,
      conversation_id: convo.id,
      direction: "out",
      sender: "ai",
      content: reply,
      platform_message_id: platformMessageId ?? null,
    });
    await admin
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", convo.id);
  } catch (err) {
    console.error("[inbound] AI reply failed", err);
    await admin.from("audit_logs").insert({
      org_id: orgId,
      action: "ai_reply_failed",
      payload: { conversation_id: convo.id, error: (err as Error).message },
    });
  }
}
