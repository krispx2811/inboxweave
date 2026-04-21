import "server-only";

/**
 * Language detection + bilingual (English/Arabic) commands and footers
 * for the Stop/Start opt-out flow. Contact- and agent-typed commands
 * both route through here so English "stop" and Arabic "إيقاف" behave
 * identically.
 */

// Common Arabic variants for "stop" — classical + colloquial + transliterated.
const STOP_WORDS = new Set([
  "stop",
  "ستوب",
  "وقف",
  "اوقف",
  "أوقف",
  "ايقاف",
  "إيقاف",
  "توقف",
  "توقّف",
]);

// Common Arabic variants for "start" / "resume".
const START_WORDS = new Set([
  "start",
  "resume",
  "ستارت",
  "ابدأ",
  "ابدا",
  "ابدأ الرد",
  "تشغيل",
  "شغل",
  "شغّل",
  "ارجع",
  "فعل",
  "فعّل",
  "كمل",
]);

export function detectStopStart(text: string | null | undefined): "stop" | "start" | null {
  if (!text) return null;
  const normalized = text.trim().toLowerCase().replace(/[.،!؟?]+$/g, "");
  if (STOP_WORDS.has(normalized)) return "stop";
  if (START_WORDS.has(normalized)) return "start";
  return null;
}

export function containsArabic(text: string | null | undefined): boolean {
  if (!text) return false;
  return /[؀-ۿ]/.test(text);
}

/** Return "ar" if the text is primarily Arabic, else "en". */
export function primaryLanguage(
  text: string | null | undefined,
  fallback: "ar" | "en" = "en",
): "ar" | "en" {
  if (!text) return fallback;
  if (containsArabic(text)) return "ar";
  if (fallback === "ar") return "ar";
  return "en";
}

export function aiFooter(language: "ar" | "en"): string {
  if (language === "ar") {
    return "\n\n—\nاكتب «إيقاف» لإيقاف الردود الآلية أو «ابدأ» لإعادة تشغيلها";
  }
  return "\n\n—\nType Stop to stop AI messages or Start to turn it back on";
}

export function stopConfirmation(language: "ar" | "en"): string {
  if (language === "ar") {
    return "تم إيقاف الرد الآلي. سيتواصل معك أحد الموظفين قريبًا. اكتب «ابدأ» لإعادة تشغيل الرد الآلي.";
  }
  return "Auto-Reply has been stopped. A team member will respond to you shortly, type Start to turn auto-reply back on.";
}

export function startConfirmation(language: "ar" | "en"): string {
  if (language === "ar") {
    return "تم تفعيل الرد الآلي مجددًا. كيف يمكنني مساعدتك؟" + aiFooter("ar");
  }
  return "Auto-Reply is back on. How can I help?" + aiFooter("en");
}

/**
 * Regex used to strip any model-emitted footer (either language) from past
 * AI messages before we include them in conversation history, and from new
 * replies before we append our canonical one.
 */
export function stripAnyFooter(text: string): string {
  const englishFooter =
    /(\s*[—–\-]*\s*(?:type\s+)?stop\s+to\s+stop\s+ai\s+messages\s+or\s+start\s+to\s+turn\s+(?:it|auto[-\s]?reply)\s+back\s+on[.!]?\s*)+$/i;
  const arabicFooter =
    /(\s*[—–\-]*\s*اكتب\s*[«"']?\s*(?:إيقاف|ايقاف|وقف)\s*[»"']?\s*لإيقاف\s+الردود\s+الآلية\s+أو\s*[«"']?\s*(?:ابدأ|ابدا)\s*[»"']?\s*لإعادة\s+تشغيلها\s*)+$/;
  return text.replace(englishFooter, "").replace(arabicFooter, "").trimEnd();
}
