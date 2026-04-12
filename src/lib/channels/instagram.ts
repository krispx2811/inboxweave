import "server-only";

const GRAPH_VERSION = "v21.0";

/**
 * Send an Instagram DM. Instagram messaging uses the same Messenger
 * send-API shape, but the page access token must come from an IG-linked
 * Facebook Page.
 */
export async function sendInstagramText(params: {
  pageAccessToken: string;
  recipientId: string;
  text: string;
}): Promise<{ messageId?: string }> {
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/me/messages?access_token=${encodeURIComponent(
      params.pageAccessToken,
    )}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: params.recipientId },
        messaging_type: "RESPONSE",
        message: { text: params.text },
      }),
    },
  );
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
    (body as { entry?: Array<{ id: string; messaging?: IGEvent[] }> }).entry ?? [];
  for (const entry of entries) {
    const pageId = entry.id;
    for (const ev of entry.messaging ?? []) {
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
