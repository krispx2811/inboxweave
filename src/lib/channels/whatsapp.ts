import "server-only";

const GRAPH_VERSION = "v21.0";

export async function sendWhatsAppText(params: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  text: string;
}): Promise<{ messageId?: string }> {
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${params.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: params.to,
        type: "text",
        text: { body: params.text },
      }),
    },
  );
  const json = (await res.json().catch(() => ({}))) as {
    messages?: Array<{ id: string }>;
    error?: { message: string };
  };
  if (!res.ok) throw new Error(`WhatsApp send failed: ${json.error?.message ?? res.statusText}`);
  return { messageId: json.messages?.[0]?.id };
}

/** Send a pre-approved WhatsApp template message (for outbound outside 24h window). */
export async function sendWhatsAppTemplate(params: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  templateName: string;
  languageCode: string;
}): Promise<{ messageId?: string }> {
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${params.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: params.to,
        type: "template",
        template: {
          name: params.templateName,
          language: { code: params.languageCode },
        },
      }),
    },
  );
  const json = (await res.json().catch(() => ({}))) as {
    messages?: Array<{ id: string }>;
    error?: { message: string };
  };
  if (!res.ok) throw new Error(`WA template failed: ${json.error?.message ?? res.statusText}`);
  return { messageId: json.messages?.[0]?.id };
}

export interface InboundWhatsAppMessage {
  phoneNumberId: string;
  from: string;
  contactName?: string;
  text: string;
  platformMessageId?: string;
  mediaUrl?: string;
  mediaType?: string;
  mediaMime?: string;
}

export function parseWhatsAppWebhook(body: unknown): InboundWhatsAppMessage[] {
  const out: InboundWhatsAppMessage[] = [];
  const entries =
    (body as { entry?: Array<{ changes?: Array<{ value?: WAValue }> }> }).entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages) continue;
      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;
      const nameFromProfile = value.contacts?.[0]?.profile?.name;
      for (const msg of value.messages) {
        // Text messages.
        if (msg.type === "text" && msg.text?.body) {
          out.push({
            phoneNumberId,
            from: msg.from,
            contactName: nameFromProfile,
            text: msg.text.body,
            platformMessageId: msg.id,
          });
        }
        // Image messages.
        else if (msg.type === "image" && msg.image) {
          out.push({
            phoneNumberId,
            from: msg.from,
            contactName: nameFromProfile,
            text: msg.image.caption ?? "",
            platformMessageId: msg.id,
            mediaUrl: msg.image.id, // Needs to be fetched via Graph API /media endpoint.
            mediaType: "image",
            mediaMime: msg.image.mime_type,
          });
        }
        // Document messages.
        else if (msg.type === "document" && msg.document) {
          out.push({
            phoneNumberId,
            from: msg.from,
            contactName: nameFromProfile,
            text: msg.document.caption ?? msg.document.filename ?? "",
            platformMessageId: msg.id,
            mediaUrl: msg.document.id,
            mediaType: "document",
            mediaMime: msg.document.mime_type,
          });
        }
        // Audio/voice messages.
        else if ((msg.type === "audio" || msg.type === "voice") && msg.audio) {
          out.push({
            phoneNumberId,
            from: msg.from,
            contactName: nameFromProfile,
            text: "[voice message]",
            platformMessageId: msg.id,
            mediaUrl: msg.audio.id,
            mediaType: "audio",
            mediaMime: msg.audio.mime_type,
          });
        }
      }
    }
  }
  return out;
}

interface WAValue {
  metadata?: { phone_number_id?: string };
  contacts?: Array<{ profile?: { name?: string } }>;
  messages?: Array<{
    id?: string;
    from: string;
    type: string;
    text?: { body?: string };
    image?: { id?: string; caption?: string; mime_type?: string };
    document?: { id?: string; caption?: string; filename?: string; mime_type?: string };
    audio?: { id?: string; mime_type?: string };
  }>;
}
