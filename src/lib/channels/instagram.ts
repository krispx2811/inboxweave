import "server-only";

const GRAPH_VERSION = "v21.0";

/**
 * Send an Instagram DM.
 *
 * If `igUserId` is provided, uses the NEW Instagram Business Login API:
 *   POST https://graph.instagram.com/v21.0/{ig-user-id}/messages
 *
 * Otherwise falls back to the Messenger-style /me/messages endpoint on
 * graph.facebook.com, which requires a Page access token from an IG-linked
 * Facebook Page.
 */
export async function sendInstagramText(params: {
  pageAccessToken: string;
  recipientId: string;
  text: string;
  igUserId?: string;
}): Promise<{ messageId?: string }> {
  const url = params.igUserId
    ? `https://graph.instagram.com/${GRAPH_VERSION}/${params.igUserId}/messages`
    : `https://graph.facebook.com/${GRAPH_VERSION}/me/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.pageAccessToken}`,
    },
    body: JSON.stringify({
      recipient: { id: params.recipientId },
      message: { text: params.text },
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    message_id?: string;
    error?: { message: string };
  };
  if (!res.ok) throw new Error(`Instagram send failed: ${json.error?.message ?? res.statusText}`);
  return { messageId: json.message_id };
}

export interface InboundInstagramMessage {
  pageId: string; // IG business account id as reported by webhook
  senderId: string;
  text: string;
  platformMessageId?: string;
}

export function parseInstagramWebhook(body: unknown): InboundInstagramMessage[] {
  const out: InboundInstagramMessage[] = [];
  const entries =
    (body as { entry?: Array<{ id: string; messaging?: IGEvent[]; standby?: IGEvent[] }> }).entry ?? [];
  for (const entry of entries) {
    const pageId = entry.id;
    // Primary inbox → "messaging" array; General inbox (handover) → "standby" array.
    // Same event shape in both; collect from both.
    const events = [...(entry.messaging ?? []), ...(entry.standby ?? [])];
    for (const ev of events) {
      if (!ev.message || ev.message.is_echo) continue;
      const text = ev.message.text;
      if (!text) continue;
      out.push({
        pageId,
        senderId: ev.sender.id,
        text,
        platformMessageId: ev.message.mid,
      });
    }
  }
  return out;
}

interface IGEvent {
  sender: { id: string };
  recipient: { id: string };
  message?: { mid?: string; text?: string; is_echo?: boolean };
}
