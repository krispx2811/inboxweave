/**
 * The AI writes Markdown (**bold**, "## headings", "- bullets"), but
 * Instagram, Messenger and SMS show it as literal symbols, and WhatsApp uses
 * its own syntax (*bold*). Convert each reply to what the customer's app
 * actually renders, right before sending.
 *
 * Pure and dependency-free so it can be unit-tested without a server context.
 */

type Platform = "whatsapp" | "instagram" | "messenger" | "sms" | string;

export function formatForPlatform(text: string, platform: Platform): string {
  let out = text
    // Headings: keep the words, drop the hashes.
    .replace(/^#{1,6}\s+/gm, "")
    // Links: "label (url)" reads fine everywhere and keeps the URL tappable.
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "$1 ($2)")
    // Bullets: a real bullet instead of "- " or "* ".
    .replace(/^(\s*)[-*]\s+/gm, "$1• ");

  if (platform === "whatsapp") {
    // WhatsApp: *bold*, _italic_.
    out = out.replace(/\*\*(.+?)\*\*/g, "*$1*").replace(/__(.+?)__/g, "*$1*");
  } else {
    // Plain-text platforms: keep the words, drop the markers.
    out = out
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      .replace(/(^|[\s(])\*(\S(?:.*?\S)?)\*(?=[\s).,!?؟،]|$)/g, "$1$2");
  }
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/** For showing a stored message in the inbox: plain text, no markers. */
export function stripMarkdown(text: string): string {
  return formatForPlatform(text, "plain");
}
