import "server-only";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { rawChatCompletion, type ChatTurn } from "@/lib/ai/openai";
import { retrieveContext } from "@/lib/ai/rag";
import { getContactMemory } from "@/lib/ai/contact-memory";
import { getLiveOffers } from "@/lib/ai/offers";
import type { LiveOffer } from "@/lib/ai/offer-format";
import { stripAnyFooter } from "./commands";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export interface ReplyContext {
  /** All inbound messages since the last outbound, joined into one turn. */
  userMessage: string;
  history: ChatTurn[];
  retrievedContext: string[];
  contactMemory: string[];
  priorSummary?: string;
  offers: LiveOffer[];
}

const KEEP_RECENT = 20;

/**
 * Everything the reply needs besides the model call itself: the burst-unified
 * user message, trimmed history, knowledge-base retrieval, past-conversation
 * memory, the long-thread summary and the offers running now. Built from the conversation as it is
 * now, so the inbound handler can start it during the burst debounce and only
 * rebuild it if the thread changed in the meantime.
 */
export async function prepareReplyContext(params: {
  admin: AdminClient;
  orgId: string;
  channelId: string;
  contactExternalId: string;
  conversationId: string;
  conversationCreatedAt?: string;
  fallbackText: string;
}): Promise<ReplyContext> {
  const { admin, orgId } = params;

  // Fetch more than 24 so we can detect long threads and summarize the older
  // portion into a "prior summary" system note — keeps context without blowing
  // up token count. Newest first; the burst is read off the top of it.
  const { data: history } = await admin
    .from("messages")
    .select("direction, sender, content, created_at")
    .eq("conversation_id", params.conversationId)
    .order("created_at", { ascending: false })
    .limit(48);

  // Build the unified user message: all IN messages since the last OUT.
  // This way a burst of ["hi", "for lasik", "how much?"] is answered as
  // one coherent reply instead of three disjoint ones.
  const burst: string[] = [];
  for (const m of (history ?? []).slice(0, 10)) {
    if (m.direction === "out") break;
    if (m.direction === "in" && m.content) burst.unshift(m.content as string);
  }
  const userMessage = burst.length > 1 ? burst.join("\n") : params.fallbackText;

  const allTurns: ChatTurn[] = (history ?? [])
    .slice()
    .reverse()
    .slice(0, -1)
    .map((m) => ({
      role: m.direction === "in" ? ("user" as const) : ("assistant" as const),
      content: m.direction === "in" ? (m.content as string) : stripAnyFooter(m.content as string),
    }));

  // Rolling summary: if the thread is long, keep the last 20 turns verbatim
  // and condense everything older into a single synthetic system note.
  // Started here and awaited together with retrieval below.
  let priorSummaryPromise: Promise<string> = Promise.resolve("");
  let turns = allTurns;
  if (allTurns.length > KEEP_RECENT + 6) {
    const transcript = allTurns
      .slice(0, allTurns.length - KEEP_RECENT)
      .map((t) => `${t.role}: ${t.content}`)
      .join("\n")
      .slice(0, 6000);
    priorSummaryPromise = rawChatCompletion({
      orgId,
      temperature: 0,
      max_tokens: 220,
      messages: [
        {
          role: "system",
          content:
            "Summarize this partial customer-support conversation in 3-4 sentences. Focus on what the customer wants, what's already been answered, and any unresolved points. Keep it neutral — no analysis, no headers.",
        },
        { role: "user", content: transcript },
      ],
    }).catch(() => "");
    turns = allTurns.slice(-KEEP_RECENT);
  }

  // Trim the last N burst messages off the history tail since they're sent
  // as the current user message instead.
  const turnsWithoutBurst = burst.length > 1 ? turns.slice(0, -(burst.length - 1)) : turns;

  // Short, vague follow-ups ("its for lasik") retrieve with the preceding
  // exchange so they find the right chunks.
  const retrievalQuery =
    userMessage.trim().length < 25 && turnsWithoutBurst.length > 0
      ? turnsWithoutBurst
          .slice(-4)
          .map((t) => t.content)
          .concat(userMessage)
          .join(" \n ")
          .slice(0, 1500)
      : userMessage;

  const [retrievedContext, contactMemory, priorSummary, offers] = await Promise.all([
    retrieveContext(orgId, retrievalQuery).catch(() => [] as string[]),
    getContactMemory(
      orgId,
      params.channelId,
      params.contactExternalId,
      params.conversationId,
      params.conversationCreatedAt,
    ).catch(() => [] as string[]),
    priorSummaryPromise,
    getLiveOffers(orgId),
  ]);

  return {
    userMessage,
    history: turnsWithoutBurst,
    retrievedContext,
    contactMemory,
    priorSummary: priorSummary || undefined,
    offers,
  };
}
