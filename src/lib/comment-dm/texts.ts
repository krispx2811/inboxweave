import { z } from "zod";
import { TEXT_KEYS, type Lang, type SavedTexts, type TextKey, type Texts } from "./types.ts";

/** Default texts, used for any field the owner leaves empty. */
export const DEFAULT_TEXTS: Record<Lang, Texts> = {
  en: {
    publicReply: "Sent you a DM 📩\nCheck your DMs 📩\nJust sent it to your DMs 👀",
    opening: "Hey! Thanks for your comment 🙌 Tap the button below and I'll send you the link.",
    openingButton: "Send me the link",
    followFirst:
      "Almost there! Follow our account first, then tap the button below and I'll send you the link right away.",
    followedButton: "I followed ✅",
    linkMessage: "Here's your link 🎉",
    linkButton: "Open link",
  },
  ar: {
    publicReply: "أرسلنا لك رسالة على الخاص 📩\nتفقد رسائلك الخاصة 📩\nأرسلنا لك التفاصيل على الخاص 👀",
    opening: "أهلاً! شكراً على تعليقك 🙌 اضغط الزر تحت ونرسل لك الرابط.",
    openingButton: "أرسل لي الرابط",
    followFirst: "باقي خطوة! تابع حسابنا أولاً، بعدها اضغط الزر تحت ونرسل لك الرابط مباشرة.",
    followedButton: "تابعت ✅",
    linkMessage: "تفضل الرابط 🎉",
    linkButton: "افتح الرابط",
  },
};

/** Longest single public reply (one line of the public reply field). */
export const PUBLIC_REPLY_LINE_LIMIT = 300;

/** Meta's limits: button labels 20, template text 640. The public reply field holds several lines. */
export const TEXT_LIMITS: Record<TextKey, number> = {
  publicReply: 1500,
  opening: 640,
  openingButton: 20,
  followFirst: 640,
  followedButton: 20,
  linkMessage: 640,
  linkButton: 20,
};

export const TEXT_LABELS: Record<TextKey, string> = {
  publicReply: "Public reply under the comment",
  opening: "First DM",
  openingButton: "First DM button",
  followFirst: "Message when they don't follow yet",
  followedButton: "\"I followed\" button",
  linkMessage: "Message with the link",
  linkButton: "Link button",
};

export const LANG_NAMES: Record<Lang, string> = { en: "English", ar: "Arabic" };

/**
 * The language to answer a comment in: Arabic letters → ar, any other
 * letters → en, no letters at all (emoji, numbers, @tags) → the default.
 */
export function pickLanguage(commentText: string, fallback: Lang): Lang {
  const words = commentText.replace(/@[A-Za-z0-9._]+/g, " ");
  if (/(?=\p{Script=Arabic})\p{L}/u.test(words)) return "ar";
  if (/\p{L}/u.test(words)) return "en";
  return fallback;
}

/** The non-empty, trimmed lines of the public reply field: one reply per line. */
export function publicReplyLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** One of the public replies, chosen at random, so Instagram doesn't see the same text hundreds of times. */
export function pickPublicReply(text: string, random: () => number = Math.random): string {
  const lines = publicReplyLines(text);
  if (lines.length === 0) return text.trim();
  if (lines.length === 1) return lines[0]!;
  const index = Math.min(lines.length - 1, Math.max(0, Math.floor(random() * lines.length)));
  return lines[index]!;
}

/** The texts to send in `lang`: the owner's non-empty texts over the defaults. */
export function resolveTexts(saved: SavedTexts | null | undefined, lang: Lang): Texts {
  const out: Texts = { ...DEFAULT_TEXTS[lang] };
  const custom = saved?.[lang] ?? {};
  for (const key of TEXT_KEYS) {
    const raw = custom[key];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (value) out[key] = value;
  }
  return out;
}

/**
 * Keep only texts that differ from the defaults, so a later change to a
 * default still reaches owners who never edited that text.
 */
export function compactTexts(texts: SavedTexts): SavedTexts {
  const out: SavedTexts = {};
  for (const lang of ["en", "ar"] as const) {
    const kept: Partial<Texts> = {};
    for (const key of TEXT_KEYS) {
      const raw = texts[lang]?.[key];
      const value = typeof raw === "string" ? raw.trim() : "";
      if (value && value !== DEFAULT_TEXTS[lang][key]) kept[key] = value;
    }
    if (Object.keys(kept).length > 0) out[lang] = kept;
  }
  return out;
}

/** https, with a host and no credentials. We send the link to Instagram; we never fetch it. */
export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.length > 0 && !url.username && !url.password;
  } catch {
    return false;
  }
}

function textField(key: TextKey, lang: Lang) {
  const limit = TEXT_LIMITS[key];
  return z
    .string()
    .trim()
    .max(limit, `${TEXT_LABELS[key]} (${LANG_NAMES[lang]}) can be at most ${limit} characters`);
}

function langTextsSchema(lang: Lang) {
  const shape = {
    publicReply: textField("publicReply", lang).refine(
      (v) => publicReplyLines(v).every((line) => line.length <= PUBLIC_REPLY_LINE_LIMIT),
      `Each public reply (${LANG_NAMES[lang]}) can be at most ${PUBLIC_REPLY_LINE_LIMIT} characters`,
    ),
    opening: textField("opening", lang),
    openingButton: textField("openingButton", lang),
    followFirst: textField("followFirst", lang),
    followedButton: textField("followedButton", lang),
    linkMessage: textField("linkMessage", lang),
    linkButton: textField("linkButton", lang),
  } satisfies Record<TextKey, z.ZodTypeAny>;
  return z.object(shape).partial();
}

export const SettingsFormSchema = z.object({
  linkUrl: z
    .string()
    .trim()
    .max(2000, "The link is too long")
    .refine((v) => v === "" || isHttpsUrl(v), "The link must start with https://")
    .transform((v) => (v === "" ? "" : new URL(v).href)),
  defaultLanguage: z.enum(["en", "ar"]),
  requireFollow: z.boolean(),
  publicReplyEnabled: z.boolean(),
  texts: z.object({ en: langTextsSchema("en"), ar: langTextsSchema("ar") }),
});
export type SettingsForm = z.infer<typeof SettingsFormSchema>;

/** Name of one text input on the settings form, e.g. "ar.opening". */
export function textFieldName(lang: Lang, key: TextKey): string {
  return `${lang}.${key}`;
}

/** Parse the settings form. `get` is FormData.get, or a fake in tests. */
export function parseSettingsForm(get: (name: string) => unknown) {
  const str = (name: string) => {
    const v = get(name);
    return typeof v === "string" ? v.replace(/\r\n/g, "\n") : "";
  };
  const textsFor = (lang: Lang) =>
    Object.fromEntries(TEXT_KEYS.map((key) => [key, str(textFieldName(lang, key))]));
  return SettingsFormSchema.safeParse({
    linkUrl: str("linkUrl"),
    defaultLanguage: str("defaultLanguage"),
    requireFollow: get("requireFollow") === "on",
    publicReplyEnabled: get("publicReplyEnabled") === "on",
    texts: { en: textsFor("en"), ar: textsFor("ar") },
  });
}
