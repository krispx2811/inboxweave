import "server-only";

const GRAPH_VERSION = "v21.0";

/** Send a Messenger text using a Page access token. */
export async function sendMessengerText(params: {
  pageAccessToken: string;
  recipientPsid: string;
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
        recipient: { id: params.recipientPsid },
        messaging_type: "RESPONSE",
        message: { text: params.text },
      }),
    },
  );
  const json = (await res.json().catch(() => ({}))) as {
    message_id?: string;
    error?: { message: string };
  };
  if (!res.ok) throw new Error(`Messenger send failed: ${json.error?.message ?? res.statusText}`);
  return { messageId: json.message_id };
}

export interface InboundMessengerMessage {
  pageId: string;
  senderPsid: string;
  text: string;
  platformMessageId?: string;
}

export function parseMessengerWebhook(body: unknown): InboundMessengerMessage[] {
  const out: InboundMessengerMessage[] = [];
  const entries =
    (body as {
      object?: string;
      entry?: Array<{ id: string; messaging?: MsgEvent[] }>;
    }).entry ?? [];
  for (const entry of entries) {
    const pageId = entry.id;
    for (const ev of entry.messaging ?? []) {
      if (!ev.message || ev.message.is_echo) continue;
      const text = ev.message.text;
      if (!text) continue;
      out.push({
        pageId,
        senderPsid: ev.sender.id,
        text,
        platformMessageId: ev.message.mid,
      });
    }
  }
  return out;
}

interface MsgEvent {
  sender: { id: string };
  recipient: { id: string };
  message?: { mid?: string; text?: string; is_echo?: boolean };
}
