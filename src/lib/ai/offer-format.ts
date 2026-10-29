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
    const validity = until ? ` (valid until ${until})` : "";
    return `• ${o.title}${validity}: ${o.details}`;
  });
}

export function offersBlock(offers: LiveOffer[]): string {
  if (offers.length === 0) return "";
  return (
    "\n\nCURRENT OFFERS — APPROVED BY THE BUSINESS AND RUNNING NOW, THESE OVERRIDE THE KNOWLEDGE BASE:\n---\n" +
    offerLines(offers).join("\n") +
    "\n---\n" +
    // Knowledge bases often script "see our Instagram for offers" or "don't
    // mention promotions unless told about one"; without this rule a general
    // "any offers?" follows that script and hides the offers listed here.
    "- When the customer asks whether there are any offers, promotions, discounts or deals, answer with the offers listed here: name each one with its prices and what's included. This list is the business telling you about its current active offers, so it replaces any knowledge-base instruction to send customers to Instagram or social media for offers, or to avoid mentioning promotions.\n" +
    "- When the customer asks the price of a service an offer lists, the offer price IS the current price: give it, say it is a limited-time offer, and you may add the regular knowledge-base price as what it replaces. Never answer with only the regular price or a price range for that service, even if the knowledge base calls its pricing table final or not to be modified.\n" +
    "- This applies to every service an offer names, including services the knowledge base says are priced separately or must be described separately, and services it gives a ready-made sample reply for that quotes the regular price: replace that price with the offer price. Keep following the knowledge base's other rules about how to describe the service.\n" +    "- Mention the end date when the customer asks about timing or booking.\n" +
    "- An offer only changes what it explicitly states. Everything it doesn't mention (other services, policies, phone numbers, addresses) still comes from the knowledge base.\n" +
    "- Only the offers listed here are running. If an offer you mentioned earlier in this conversation is not listed, it has ended: do not repeat it, and quote the current knowledge-base value instead.\n" +
    "- Bring up an offer when it is relevant to what the customer asked about; do not push unrelated offers."
  );
}
