/**
 * Stale-price suppression for AI context.
 *
 * Prices the assistant quoted in earlier turns are replayed back to it as
 * `assistant` messages, so it stays consistent with what it already said even
 * after the knowledge base is corrected. Instructing it that the knowledge base
 * wins helps, but isn't reliable while the old number is still sitting in the
 * transcript — so we also physically remove any amount the knowledge base no
 * longer supports.
 *
 * Matching REQUIRES a currency marker adjacent to the number. Bare digits are
 * never touched: phone numbers, dates, ages, quantities and service codes must
 * survive intact, and Oman's 8-digit phone numbers would otherwise be mangled.
 *
 * Pure and dependency-free so it can be unit-tested without a server context.
 */

const DIGITS = "0-9٠-٩۰-۹"; // Western + Arabic-Indic + Persian
const CURRENCIES = "OMR|USD|AED|SAR|KWD|BHD|QAR|ريال|ر\\.ع";

/** Built fresh per call — a shared /g regex carries lastIndex between uses. */
function moneyToken(): RegExp {
  return new RegExp(
    `(?:(?:${CURRENCIES})\\s?[${DIGITS}][${DIGITS},.]*` +
      `|[${DIGITS}][${DIGITS},.]*\\s?(?:${CURRENCIES})` +
      `|\\$\\s?[${DIGITS}][${DIGITS},.]*)`,
    "gi",
  );
}

export const REDACTED =
  "[an outdated figure was removed — quote the current one from the knowledge base]";

/** Digits of a money token, normalised to Western numerals for comparison. */
export function amountOf(token: string): string {
  let out = "";
  for (const ch of token) {
    const c = ch.codePointAt(0)!;
    if (ch >= "0" && ch <= "9") out += ch;
    else if (c >= 0x0660 && c <= 0x0669) out += String(c - 0x0660);
    else if (c >= 0x06f0 && c <= 0x06f9) out += String(c - 0x06f0);
    else if (ch === ".") out += ".";
    // Thousands separators are dropped so "1,250" and "1250" compare equal.
  }
  return out.replace(/\.$/, "");
}

/** Every amount the retrieved knowledge base currently vouches for. */
export function supportedAmounts(retrievedContext: string[]): Set<string> {
  const joined = retrievedContext.join("\n");
  return new Set([...joined.matchAll(moneyToken())].map((m) => amountOf(m[0])));
}

/**
 * Replace every money amount in `text` that `live` does not vouch for.
 *
 * Over-redacting is the safe direction: the anti-hallucination policy already
 * prefers saying nothing to saying a wrong number, and the source-precedence
 * block tells the model to re-read the knowledge base for the correct value.
 */
export function redactUnsupportedAmounts(text: string, live: Set<string>): string {
  return text.replace(moneyToken(), (m) => (live.has(amountOf(m)) ? m : REDACTED));
}
