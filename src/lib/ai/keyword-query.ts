/**
 * Keyword half of the hybrid knowledge-base search.
 *
 * `websearch_to_tsquery` ANDs every word, so a full customer message ("what is
 * the price of lasik surgery") only matches a chunk containing all of them —
 * in practice nothing, leaving retrieval to the vector half alone and missing
 * exact names and prices. Instead keep the distinctive words and OR them, so
 * chunks are ranked by how many of them they contain.
 *
 * Pure and dependency-free so it can be unit-tested without a server context.
 */

// Words common enough to match nearly every chunk. Question words carry intent,
// not content, so they don't help find the right chunk either.
const STOPWORDS = new Set([
  // English
  "the", "and", "for", "are", "was", "you", "your", "with", "this", "that", "have",
  "has", "can", "could", "would", "will", "what", "when", "where", "which", "who",
  "how", "why", "about", "from", "there", "their", "they", "them", "then", "than",
  "want", "need", "like", "please", "thanks", "thank", "hello", "hey", "its", "it's",
  "our", "out", "any", "all", "but", "not", "just", "also", "does", "did", "get",
  "much", "many", "some", "tell", "know", "is", "of", "to", "in", "on", "at", "an",
  "or", "be", "do", "me", "my", "we", "us", "it", "if", "so", "up", "hi",
  // Arabic
  "في", "من", "على", "الى", "إلى", "عن", "مع", "هل", "هذا", "هذه", "ذلك", "التي",
  "الذي", "انا", "أنا", "انت", "أنت", "او", "أو", "ثم", "لو", "ما", "لا", "نعم",
  "شكرا", "مرحبا", "السلام", "عليكم", "ابي", "ابغى", "أريد", "اريد", "ممكن",
]);

const MAX_TERMS = 12;

export function keywordQuery(text: string): string {
  const seen = new Set<string>();
  const terms: string[] = [];
  // Letters and digits in any script; everything else separates words.
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 2 || STOPWORDS.has(raw) || seen.has(raw)) continue;
    // Single letters and bare one-digit numbers are noise; prices stay.
    if (raw.length < 3 && !/^\p{N}+$/u.test(raw)) continue;
    seen.add(raw);
    terms.push(raw);
    if (terms.length === MAX_TERMS) break;
  }
  // websearch_to_tsquery syntax: "a or b" → 'a' | 'b'.
  return terms.join(" or ");
}
