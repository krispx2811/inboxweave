/**
 * Builds the messages for a customer reply: the system prompt (org prompt,
 * standing rules, memory, knowledge base, offers, precedence) plus the
 * cleaned conversation history.
 *
 * Pure and dependency-free (beyond the pure helpers it imports) so it can be
 * unit-tested and replayed against real data without a server context.
 */
import { offerLines, offersBlock, type LiveOffer } from "./offer-format.ts";
import { redactUnsupportedAmounts, supportedAmounts } from "./price-guard.ts";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ReplyPromptInput {
  systemPrompt: string;
  userMessage: string;
  history: ChatTurn[];
  retrievedContext: string[];
  contactMemory?: string[];
  priorSummary?: string;
  replyInLanguage?: string;
  offers?: LiveOffer[];
}

export function buildReplyMessages(params: ReplyPromptInput): Array<{ role: string; content: string }> {
  // Amounts the knowledge base and the running offers currently support. With
  // neither there is nothing to check against, so redaction is skipped
  // entirely rather than blanking every price in the thread. An offer that has
  // ended is no longer listed, so its price is redacted from old turns too.
  const offers = params.offers ?? [];
  const currentSources = [...params.retrievedContext, ...offerLines(offers)];
  const hasSources = currentSources.length > 0;
  const live = supportedAmounts(currentSources);
  const redact = (text: string) =>
    live.size > 0 ? redactUnsupportedAmounts(text, live) : text;

  // Only the assistant's own turns are cleaned. A customer quoting a price back
  // at us ("you said 490") must survive verbatim, or the model loses the thread.
  const history = hasSources
    ? params.history.map((turn) =>
        turn.role === "assistant" ? { ...turn, content: redact(turn.content) } : turn,
      )
    : params.history;

  // Same treatment for the two other channels that carry the assistant's past
  // words: summaries of earlier conversations, and the rolling summary of this
  // one. Both are generated from transcripts and inherit their stale figures.
  const contactMemory =
    hasSources
      ? params.contactMemory?.map(redact)
      : params.contactMemory;
  const priorSummary =
    hasSources && params.priorSummary
      ? redact(params.priorSummary)
      : params.priorSummary;

  const contextBlock =
    params.retrievedContext.length > 0
      ? `\n\nKNOWLEDGE BASE — THE AUTHORITATIVE SOURCE OF TRUTH FOR THIS BUSINESS:\n---\n${params.retrievedContext.join("\n---\n")}\n---`
      : "";

  // Ranks the competing inputs to this prompt. Without it the model has no way
  // to order the per-org system prompt, past-conversation summaries, its own
  // earlier replies, and the retrieved knowledge base — so a stale figure (one
  // baked into an org's prompt, or one the assistant quoted earlier in the
  // thread) silently beats a freshly updated knowledge base. Only meaningful
  // when there IS retrieved context or a running offer, so it's gated below.
  const precedence =
    "\n\nSOURCE PRECEDENCE — APPLY BEFORE ANSWERING:\n" +
    "1. The KNOWLEDGE BASE block is the single source of truth for every price, fee, phone number, date, address, and policy." +
    (offers.length > 0
      ? " The one exception is the CURRENT OFFERS block: while an offer is listed there, it wins over the knowledge base for exactly what it covers, and it is the answer whenever the customer asks about offers or promotions."
      : "") +
    "\n" +
    "2. Together they OVERRIDE anything stated earlier in this system prompt, any past-conversation summary, and — critically — anything YOU said earlier in this conversation.\n" +
    "3. If a figure you quoted earlier in this thread disagrees with the knowledge base, the knowledge base is right and your earlier message was wrong. Quote the knowledge base value. Do not repeat or defend the earlier number, and do not draw attention to the change unless the customer asks about it.\n" +
    "4. If the KNOWLEDGE BASE ITSELF gives two different values for the same item, do NOT pick one and do NOT average them. Say the exact figure depends on the specific case and offer to confirm it with the team.\n" +
    "5. Values introduced as illustrations — anything after 'e.g.', 'for example', 'sample', or shown as a placeholder like XX — are formatting demonstrations, NOT real data. Never quote them as facts.";

  const memoryBlock =
    contactMemory && contactMemory.length > 0
      ? `\n\nYou have spoken with this customer before. Use these past summaries as background — reference them naturally when relevant but do not re-introduce topics the customer hasn't asked about. These summaries were written in the past and MAY CONTAIN OUTDATED PRICES OR DETAILS; the knowledge base always wins over them:\n${contactMemory.join("\n")}`
      : "";

  const summaryBlock = priorSummary
    ? `\n\nEarlier in this same conversation (paraphrased summary):\n${priorSummary}\n\nThe turns below continue from that point.`
    : "";

  const languageInstruction = params.replyInLanguage
    ? `\n\nIMPORTANT: Always reply in ${params.replyInLanguage}. Match the customer's language.`
    : "\n\nIMPORTANT: Detect the customer's language and always reply in the same language they use.";

  const contextInstruction =
    "\n\nIMPORTANT: Read the entire conversation history carefully before replying. " +
    "Treat short or vague follow-up messages (e.g. 'its for lasik', 'yes', 'how much?', " +
    "'the second one') as continuations of the previous topic — use what the customer " +
    "said earlier to resolve what they're asking about now. If context is genuinely " +
    "ambiguous, ask one clarifying question instead of guessing.";

  // Applied to EVERY org regardless of per-org prompt. Stops the model from
  // inventing phone numbers, prices, service codes, or any other digits it
  // doesn't have in context.
  const antiHallucination =
    "\n\nCRITICAL — DO NOT FABRICATE DATA:\n" +
    "- Phone numbers, WhatsApp numbers, email addresses, service codes, prices, dates, and any numeric identifiers MUST be quoted VERBATIM from the knowledge base or this system prompt.\n" +
    "- NEVER invent, pad, round, or fill digits with placeholders like 9999, 0000, XXXX, or '-'.\n" +
    "- If a requested number or detail is not in your context, say 'Let me get the exact details from our team' (or the Arabic equivalent 'دعني أتواصل مع الفريق') instead of guessing.\n" +
    "- Copy each digit exactly, including leading zeros and all 8+ digits of local numbers. Do not abbreviate.\n" +
    "- If you find yourself unsure whether a number is complete, choose to NOT provide it rather than provide a wrong one.";

  return [
    {
      role: "system",
      // Unchanging parts first: OpenAI caches a repeated prompt prefix
      // automatically, which cuts time-to-first-token and cost on every
      // reply for the same org. Per-message parts follow.
      content:
        params.systemPrompt +
        contextInstruction +
        antiHallucination +
        memoryBlock +
        summaryBlock +
        contextBlock +
        languageInstruction +
        (hasSources ? precedence : "") +
        // Offers last, closest to the conversation: the knowledge base often
        // states its regular prices emphatically ("final", "do not modify"),
        // and a model reconciling the two sections favours the one it read
        // most recently.
        offersBlock(offers),
    },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: params.userMessage },
  ];
}
