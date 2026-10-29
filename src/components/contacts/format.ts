/**
 * Small pure helpers for the Contacts page. No server or React imports, so
 * they are safe from both server and client components.
 */
import { getInitials } from "@/lib/avatar";

export const CONTACTS_PAGE_SIZE = 50;
export const CONTACTS_MAX = 500;

/** `?n=` → how many contacts to load: a multiple of 50 between 50 and 500. */
export function parseContactLimit(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n) || n <= CONTACTS_PAGE_SIZE) return CONTACTS_PAGE_SIZE;
  return Math.min(CONTACTS_MAX, Math.ceil(n / CONTACTS_PAGE_SIZE) * CONTACTS_PAGE_SIZE);
}

/** People type "@sara" or "+968…"; usernames and platform ids are stored without them. */
export function normalizeContactSearch(q: string | undefined): string {
  return (q ?? "").trim().replace(/^[@+]+/, "").trim();
}

let languageNames: Intl.DisplayNames | null | undefined;

/** "ar" → "Arabic", "en" → "English"; unknown codes come back upper-cased. */
export function languageName(code: string | null | undefined): string | null {
  const c = code?.trim();
  if (!c) return null;
  if (languageNames === undefined) {
    try {
      languageNames = new Intl.DisplayNames(["en"], { type: "language" });
    } catch {
      languageNames = null;
    }
  }
  try {
    const name = languageNames?.of(c);
    if (name && name.toLowerCase() !== c.toLowerCase()) return name;
  } catch {
    // Not a valid BCP 47 tag; fall through.
  }
  return c.toUpperCase();
}

/**
 * Initials for the avatar fallback. Strips emoji and punctuation first so
 * "🌸 Sara" or "dr.sara_clinic" don't produce a half surrogate or an "@".
 */
export function contactInitials(name: string | null | undefined, fallback: string): string {
  const cleaned = (name ?? "").replace(/[^\p{L}\p{N}\s]/gu, "").trim();
  return getInitials(cleaned || null, fallback || "?");
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  sms: "SMS",
  email: "Email",
};

export function platformLabel(platform: string | null | undefined): string {
  if (!platform) return "Unknown channel";
  return PLATFORM_LABELS[platform] ?? `${platform.charAt(0).toUpperCase()}${platform.slice(1)}`;
}
