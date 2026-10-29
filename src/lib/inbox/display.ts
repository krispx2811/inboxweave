/**
 * How a contact is named across the inbox and contacts pages.
 *
 * Instagram often sends no display name but does send a username, and the
 * numeric platform id means nothing to a person, so fall back name →
 * @username → phone (WhatsApp/SMS ids are phone numbers) → a short label.
 *
 * Pure and dependency-free so it can be unit-tested without a server context.
 */
export function contactDisplayName(c: {
  contact_name?: string | null;
  contact_username?: string | null;
  contact_external_id?: string | null;
  platform?: string | null;
}): string {
  const name = c.contact_name?.trim();
  if (name) return name;
  const username = c.contact_username?.trim();
  if (username) return `@${username}`;
  const id = c.contact_external_id ?? "";
  if ((c.platform === "whatsapp" || c.platform === "sms") && /^\+?\d{7,15}$/.test(id)) {
    return id.startsWith("+") ? id : `+${id}`;
  }
  const label = c.platform ? `${c.platform.charAt(0).toUpperCase()}${c.platform.slice(1)} user` : "Customer";
  return id ? `${label} ·${id.slice(-4)}` : label;
}

/** Second line under the name: @username when the name is a real name. */
export function contactHandle(c: { contact_name?: string | null; contact_username?: string | null }): string | null {
  return c.contact_name?.trim() && c.contact_username?.trim() ? `@${c.contact_username.trim()}` : null;
}

/** "AI: ", "You: " or "" before a preview, by who sent the last message. */
export function previewPrefix(m: { direction: "in" | "out"; sender: string } | undefined): string {
  if (!m || m.direction === "in") return "";
  return m.sender === "ai" ? "AI: " : "You: ";
}
