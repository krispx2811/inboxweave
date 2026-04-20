import "server-only";

const GRAPH_VERSION = "v21.0";

/**
 * Send an Instagram DM.
 *
 * Uses the Instagram Business Login API format:
 *   POST https://graph.instagram.com/v21.0/me/messages
 *   Body: { recipient: {id}, message: {text}, access_token }
 *
 * (Note: access_token goes in the JSON BODY, not a header or query param —
 * this is the working pattern for IG Business Login tokens.)
 *
 * If `useFacebookGraph` is passed (legacy page access token from Facebook
 * Login flow), falls back to graph.facebook.com.
 */
export async function sendInstagramText(params: {
  pageAccessToken: string;
  recipientId: string;
  text: string;
  igUserId?: string;
  useFacebookGraph?: boolean;
}): Promise<{ messageId?: string }> {
  const host = params.useFacebookGraph ? "graph.facebook.com" : "graph.instagram.com";
  const url = `https://${host}/${GRAPH_VERSION}/me/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: params.recipientId },
      message: { text: params.text },
      access_token: params.pageAccessToken,
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
    (body as {
      entry?: Array<{
        id: string;
        messaging?: IGEvent[];
        standby?: IGEvent[];
        changes?: Array<{ field: string; value: IGEvent }>;
      }>;
    }).entry ?? [];

  for (const entry of entries) {
    const pageId = entry.id;

    // Meta delivers Instagram DM events via three possible arrays:
    //   entry.messaging[] — classic Messenger-style (Primary inbox)
    //   entry.standby[]   — handover protocol / General inbox
    //   entry.changes[]   — NEW Instagram API format where each change has
    //                        { field: "messages", value: <event> }
    const events: IGEvent[] = [
      ...(entry.messaging ?? []),
      ...(entry.standby ?? []),
    ];
    for (const ch of entry.changes ?? []) {
      if (ch.field === "messages" && ch.value) events.push(ch.value);
    }

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
