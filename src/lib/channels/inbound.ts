import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ChannelPlatform } from "@/lib/supabase/types";
import { generateReply, detectLanguage } from "@/lib/ai/openai";
import { retrieveContext } from "@/lib/ai/rag";
import { analyzeSentiment } from "@/lib/ai/analysis";
import { classifyConversation } from "@/lib/ai/classify";
import { getContactMemory } from "@/lib/ai/contact-memory";
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatch";
import { OutsideWindowError, sendOutbound, sendTypingIndicatorFast } from "./router";
import { getCachedChannel, setCachedChannel } from "./cache";
import {
  aiFooter,
  detectStopStart,
  primaryLanguage,
  startConfirmation,
  stopConfirmation,
  stripAnyFooter,
} from "./commands";

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

// Legacy names retained to keep fewer call sites changing. Real implementations
// live in commands.ts and are bilingual (English + Arabic).
const stripFooter = stripAnyFooter;

export async function handleInbound(msg: NormalizedInbound): Promise<void> {
  const admin = createSupabaseAdminClient();

  // Fast path: if this channel was seen in the last 60s on this function
  // instance, fire the typing bubble NOW — before any DB round-trip.
  // The authoritative DB lookup still runs below; we just don't wait for
  // it to show the bubble.
  const cachedChannel = getCachedChannel(msg.platform, msg.channelExternalId);
  if (
    cachedChannel &&
    cachedChannel.status === "active" &&
    (cachedChannel.platform === "instagram" || cachedChannel.platform === "messenger")
  ) {
    sendTypingIndicatorFast({
      platform: cachedChannel.platform,
      accessTokenCiphertext: cachedChannel.access_token_ciphertext,
      contactExternalId: msg.contactExternalId,
    }).catch(() => {});
  }

  // 1. Resolve channel → org.
  const { data: channel, error: chErr } = await admin
    .from("channels")
    .select("id, org_id, platform, status, access_token_ciphertext")
    .eq("platform", msg.platform)
    .eq("external_id", msg.channelExternalId)
    .maybeSingle();
  if (chErr) throw new Error(chErr.message);
  if (!channel) {
    console.warn(`[inbound] no channel for ${msg.platform} external_id=${msg.channelExternalId}; ignoring`);
    return;
  }

  // Refresh the cache with the fresh row for the next inbound.
  setCachedChannel(msg.platform, msg.channelExternalId, {
    id: channel.id as string,
    org_id: channel.org_id as string,
    platform: channel.platform as string,
    status: channel.status as string,
    access_token_ciphertext: channel.access_token_ciphertext as string,
  });

  const orgId = channel.org_id as string;

  // Slow path: no cache hit (cold start or first message on this channel).
  // Fire now, in parallel with DB writes below.
  if (
    !cachedChannel &&
    channel.status === "active" &&
    (channel.platform === "instagram" || channel.platform === "messenger")
  ) {
    sendTypingIndicatorFast({
      platform: channel.platform as string,
      accessTokenCiphertext: channel.access_token_ciphertext as string,
      contactExternalId: msg.contactExternalId,
    }).catch(() => {});
  }

  // Note: we process the message even if channel.status !== "active" (e.g. the
  // token is invalidated). Persisting the inbound so agents can see it in the
  // inbox is more important than the auto-reply; AI sends are gated below.

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
  const { data: insertedMsg, error: msgErr } = await admin
    .from("messages")
    .insert({
      org_id: orgId,
      conversation_id: convo.id,
      direction: "in",
      sender: "contact",
      content: msg.text || (msg.mediaType ? `[${msg.mediaType}]` : "[media]"),
      platform_message_id: msg.platformMessageId ?? null,
      media_url: msg.mediaUrl ?? null,
      media_type: msg.mediaType ?? null,
      media_mime: msg.mediaMime ?? null,
    })
    .select("id, created_at")
    .single();
  if (msgErr || !insertedMsg) throw new Error(msgErr?.message ?? "Failed to insert message");

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

    // Auto-classify (topic + priority). Also merges category into tags so
    // the existing tag UI shows it; priority drives inbox sorting.
    const classifyPromise = classifyConversation(orgId, msg.text).then(async (cls) => {
      const { data: current } = await admin
        .from("conversations")
        .select("tags")
        .eq("id", convo.id)
        .maybeSingle();
      const currentTags = (current?.tags as string[] | null) ?? [];
      const tags = currentTags.includes(cls.category)
        ? currentTags
        : [...currentTags, cls.category];
      await admin
        .from("conversations")
        .update({ category: cls.category, priority: cls.priority, tags })
        .eq("id", convo.id);
    }).catch(() => {});

    // Don't await these — fire and forget.
    void langPromise;
    void sentimentPromise;
    void classifyPromise;
  }

  // 6. Handle stop/start opt-out commands from the contact. Supports English
  // ("stop"/"start") and Arabic ("إيقاف"/"ابدأ" and common variants).
  // Confirmation language matches the language the customer used.
  const command = detectStopStart(msg.text);
  if (command === "stop") {
    if (convo.ai_enabled) {
      const lang = primaryLanguage(msg.text, (detectedLang as "ar" | "en") ?? "en");
      const confirmation = stopConfirmation(lang);
      await admin.from("conversations").update({ ai_enabled: false }).eq("id", convo.id);
      try {
        const sent = await sendOutbound({ conversationId: convo.id, text: confirmation });
        await admin.from("messages").insert({
          org_id: orgId,
          conversation_id: convo.id,
          direction: "out",
          sender: "ai",
          content: confirmation,
          platform_message_id: sent.platformMessageId ?? null,
        });
        await admin
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", convo.id);
      } catch (err) {
        console.error("[inbound] stop confirmation failed", err);
      }
      await admin.from("audit_logs").insert({
        org_id: orgId,
        action: "ai_auto_disabled",
        payload: { conversation_id: convo.id, reason: "contact_typed_stop", language: lang },
      });
    }
    return;
  }
  if (command === "start") {
    if (!convo.ai_enabled) {
      const lang = primaryLanguage(msg.text, (detectedLang as "ar" | "en") ?? "en");
      const confirmation = startConfirmation(lang);
      await admin.from("conversations").update({ ai_enabled: true }).eq("id", convo.id);
      try {
        const sent = await sendOutbound({ conversationId: convo.id, text: confirmation });
        await admin.from("messages").insert({
          org_id: orgId,
          conversation_id: convo.id,
          direction: "out",
          sender: "ai",
          content: confirmation,
          platform_message_id: sent.platformMessageId ?? null,
        });
        await admin
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", convo.id);
      } catch (err) {
        console.error("[inbound] start confirmation failed", err);
      }
      await admin.from("audit_logs").insert({
        org_id: orgId,
        action: "ai_auto_enabled",
        payload: { conversation_id: convo.id, reason: "contact_typed_start", language: lang },
      });
    }
    return;
  }

  // 7. AI reply, if enabled, channel healthy, and there is text.
  if (!convo.ai_enabled || !msg.text) return;
  if (channel.status !== "active") {
    await admin.from("audit_logs").insert({
      org_id: orgId,
      action: "ai_reply_skipped",
      payload: { conversation_id: convo.id, reason: "channel_status", status: channel.status },
    });
    return;
  }

  // Debounce: customers often send multiple quick messages in a burst
  // ("hi", "im interested in lasik", "how much?"). Wait 1.5s, then check if
  // another inbound arrived. If it did, that handler will take over — we
  // bail out. Only the handler for the LAST message in a burst generates
  // a unified reply. 1.5s is tuned to stay well under Meta's 5s webhook
  // retry timeout while still catching most bursts.
  await new Promise((r) => setTimeout(r, 1500));

  const { data: newestIn } = await admin
    .from("messages")
    .select("id, created_at")
    .eq("conversation_id", convo.id)
    .eq("direction", "in")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (newestIn && newestIn.id !== insertedMsg.id) {
    // A newer inbound arrived during our debounce — yield to its handler.
    return;
  }

  // Re-check ai_enabled after the debounce — the owner may have typed
  // "stop" in the inbox composer or toggled the Pause AI button while we
  // were waiting. Also catches sentiment-based auto-escalation.
  const { data: freshConvo } = await admin
    .from("conversations")
    .select("ai_enabled")
    .eq("id", convo.id)
    .maybeSingle();
  if (!freshConvo?.ai_enabled) {
    await admin.from("audit_logs").insert({
      org_id: orgId,
      action: "ai_reply_skipped",
      payload: {
        conversation_id: convo.id,
        reason: "ai_disabled_during_debounce",
      },
    });
    return;
  }

  // Refresh the typing indicator — Meta auto-clears it after ~5-20s and
  // our debounce + RAG + generation can take 6-10s total, which would make
  // the bubble disappear before the real reply arrives. Calling typing_on
  // again here resets the clear timer so it stays visible until the
  // message itself supersedes it.
  if (
    channel.status === "active" &&
    (channel.platform === "instagram" || channel.platform === "messenger")
  ) {
    sendTypingIndicatorFast({
      platform: channel.platform as string,
      accessTokenCiphertext: channel.access_token_ciphertext as string,
      contactExternalId: msg.contactExternalId,
    }).catch(() => {});
  }

  // Build the unified user message: all IN messages since the last OUT.
  // This way a burst of ["hi", "for lasik", "how much?"] is answered as
  // one coherent reply instead of three disjoint ones.
  const { data: sinceLastOut } = await admin
    .from("messages")
    .select("direction, content, created_at")
    .eq("conversation_id", convo.id)
    .order("created_at", { ascending: false })
    .limit(10);
  const burst: string[] = [];
  for (const m of sinceLastOut ?? []) {
    if (m.direction === "out") break;
    if (m.direction === "in" && m.content) burst.unshift(m.content as string);
  }
  const unifiedUserMessage = burst.length > 1 ? burst.join("\n") : msg.text;

  try {
    const { data: history } = await admin
      .from("messages")
      .select("direction, sender, content, created_at")
      .eq("conversation_id", convo.id)
      .order("created_at", { ascending: false })
      .limit(24);

    const turns = (history ?? [])
      .reverse()
      .slice(0, -1)
      .map((m) => ({
        role: m.direction === "in" ? ("user" as const) : ("assistant" as const),
        // Strip any legacy Stop/Start footer from past assistant messages so
        // the model gets a clean view of the conversation.
        content:
          m.direction === "in"
            ? (m.content as string)
            : stripFooter(m.content as string),
      }));

    // Trim the last N burst messages off the history tail since we're
    // sending them as the current user_message instead.
    const turnsWithoutBurst =
      burst.length > 1 ? turns.slice(0, -(burst.length - 1)) : turns;

    // Build a context-aware RAG query from the last few turns so follow-ups
    // like "its for lasik" (after "what is the consultation?") retrieve the
    // right chunks. We prioritise the current (possibly burst-unified)
    // message but include the preceding exchange for short/vague follow-ups.
    const recentText = turnsWithoutBurst
      .slice(-4)
      .map((t) => t.content)
      .concat(unifiedUserMessage)
      .join(" \n ")
      .slice(0, 1500);

    let step = "retrieveContext";
    let reply: string;
    let platformMessageId: string | undefined;
    try {
      const retrievalQuery =
        unifiedUserMessage.trim().length < 25 && turnsWithoutBurst.length > 0
          ? recentText
          : unifiedUserMessage;
      // Fetch RAG context and past-conversation memory in parallel.
      const [context, contactMemory] = await Promise.all([
        retrieveContext(orgId, retrievalQuery).catch(() => [] as string[]),
        getContactMemory(
          orgId,
          channel.id as string,
          msg.contactExternalId,
          convo.id as string,
        ).catch(() => [] as string[]),
      ]);
      step = "generateReply";
      reply = await generateReply({
        orgId,
        conversationId: convo.id as string,
        userMessage: unifiedUserMessage,
        history: turnsWithoutBurst,
        retrievedContext: context,
        contactMemory,
        replyInLanguage: detectedLang ?? undefined,
      });
      if (!reply) return;
      // Defensive: strip any footer the model may have mimicked from prior
      // assistant messages before we append our canonical one.
      reply = stripFooter(reply);
      step = "sendOutbound";
      // Pick footer language to match the customer's language.
      const footerLang = primaryLanguage(
        unifiedUserMessage,
        (detectedLang as "ar" | "en") ?? "en",
      );
      const sent = await sendOutbound({
        conversationId: convo.id,
        text: reply + aiFooter(footerLang),
      });
      platformMessageId = sent.platformMessageId;
    } catch (err) {
      // Meta's 24-hour window rejection is expected (message requests,
      // stale conversations). Log it gently and move on — not a real failure.
      if (err instanceof OutsideWindowError) {
        await admin.from("audit_logs").insert({
          org_id: orgId,
          action: "ai_reply_skipped",
          payload: {
            conversation_id: convo.id,
            reason: "outside_messaging_window",
          },
        });
        return;
      }
      const detail = `[step=${step}] ${(err as Error).message}`;
      console.error("[inbound] AI reply failed", detail);
      await admin.from("audit_logs").insert({
        org_id: orgId,
        action: "ai_reply_failed",
        payload: { conversation_id: convo.id, error: detail, step },
      });
      return;
    }

    // Persist the bare reply (without the footer) so the next turn's
    // conversation history stays clean and the model doesn't learn to
    // repeat the footer.
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
