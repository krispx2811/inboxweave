/**
 * Formatting for the current-offers block of the reply prompt.
 *
 * Pure and dependency-free so it can be unit-tested without a server context.
 */

export interface LiveOffer {
  title: string;
  details: string;
  ends_at: string | null;
  tz_offset_minutes: number;
}

/** The offer's last day in the business's own calendar (YYYY-MM-DD). */
export function localEndDate(offer: Pick<LiveOffer, "ends_at" | "tz_offset_minutes">): string | null {
  if (!offer.ends_at) return null;
  const local = new Date(new Date(offer.ends_at).getTime() - offer.tz_offset_minutes * 60_000);
  return local.toISOString().slice(0, 10);
}

/** One entry per offer; also the text the price guard treats as current. */
export function offerLines(offers: LiveOffer[]): string[] {
  return offers.map((o) => {
    const until = localEndDate(o);
    return `• ${o.title}${until ? ` (valid until ${until})` : ""}: ${o.details}`;
  });
}

export function offersBlock(offers: LiveOffer[]): string {
  if (offers.length === 0) return "";
  return (
    "\n\nCURRENT OFFERS — RUNNING NOW, THESE OVERRIDE THE KNOWLEDGE BASE:\n---\n" +
    offerLines(offers).join("\n") +
    "\n---\n" +
    "- For any service, product or price an offer covers, quote the offer instead of the knowledge base's regular price or terms, and say it is a limited-time offer. Mention the end date when the customer asks about timing or booking.\n" +
    "- An offer only changes what it explicitly states. Everything it doesn't mention (other services, policies, phone numbers, addresses) still comes from the knowledge base.\n" +
    "- Only the offers listed here are running. If an offer you mentioned earlier in this conversation is not listed, it has ended: do not repeat it, and quote the current knowledge-base value instead.\n" +
    "- Bring up an offer when it is relevant to what the customer asked about; do not push unrelated offers."
  );
}
