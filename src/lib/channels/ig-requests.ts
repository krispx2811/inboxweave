import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, pgByteaToBuffer } from "@/lib/crypto/secrets";
import { handleInbound } from "./inbound";

/**
 * Poll Instagram's Graph API for pending message requests on a single
 * channel and route any un-processed messages through the normal inbound
 * pipeline. The act of replying (which handleInbound does when AI is on)
 * automatically moves the conversation from Requests → Primary.
 *
 * De-duplicates against our messages table by platform_message_id so we
 * don't double-process a request that was already accepted on a prior poll.
 */
export async function acceptIgPendingRequests(channelId: string): Promise<{
  processed: number;
  error?: string;
}> {
  const admin = createSupabaseAdminClient();

  const { data: channel } = await admin
    .from("channels")
    .select("id, org_id, external_id, access_token_ciphertext, status, platform, auto_accept_requests")
    .eq("id", channelId)
    .eq("platform", "instagram")
    .maybeSingle();
  if (!channel) return { processed: 0, error: "channel not found" };
  if (!channel.auto_accept_requests) return { processed: 0 };
  if (channel.status !== "active") return { processed: 0 };

  let token: string;
  try {
    token = decryptSecret(
      pgByteaToBuffer(channel.access_token_ciphertext as unknown as string),
    );
  } catch (err) {
    return { processed: 0, error: `decrypt: ${(err as Error).message}` };
  }

  // Update last poll time (diagnostic).
  await admin
    .from("channels")
    .update({ last_request_poll_at: new Date().toISOString() })
    .eq("id", channelId);

  // List pending-request conversations. IG Business Login uses the
  // graph.instagram.com host with IGAA tokens.
  const listUrl = new URL(`https://graph.instagram.com/v21.0/me/conversations`);
  listUrl.searchParams.set("platform", "instagram");
  listUrl.searchParams.set("folder", "messages_pending");
  listUrl.searchParams.set("fields", "id,participants,updated_time");
  listUrl.searchParams.set("limit", "20");
  listUrl.searchParams.set("access_token", token);

  const listRes = await fetch(listUrl.toString());
  const listBody = await listRes.text();
  if (!listRes.ok) {
    return { processed: 0, error: `list ${listRes.status}: ${listBody.slice(0, 200)}` };
  }

  let conversations: Array<{ id: string; participants?: { data: Array<{ id: string; username?: string }> } }> = [];
  try {
    conversations = (JSON.parse(listBody) as { data?: typeof conversations }).data ?? [];
  } catch {
    return { processed: 0, error: "list response not json" };
  }

  const businessId = channel.external_id as string;
  let processed = 0;

  for (const convo of conversations) {
    // Find the other participant (the customer).
    const contact = convo.participants?.data.find((p) => p.id !== businessId);
    if (!contact) continue;

    // Fetch the latest messages in this conversation.
    const msgsUrl = new URL(`https://graph.instagram.com/v21.0/${convo.id}`);
    msgsUrl.searchParams.set(
      "fields",
      "messages.limit(5){id,from,to,message,created_time}",
    );
    msgsUrl.searchParams.set("access_token", token);

    const msgsRes = await fetch(msgsUrl.toString());
    if (!msgsRes.ok) continue;
    const msgsJson = await msgsRes.json().catch(() => ({})) as {
      messages?: { data?: Array<{ id: string; from?: { id: string }; message?: string; created_time?: string }> };
    };
    const msgs = msgsJson.messages?.data ?? [];

    // Newest → oldest; pick the newest message from the customer.
    const fromCustomer = msgs.find((m) => m.from && m.from.id === contact.id);
    if (!fromCustomer || !fromCustomer.message) continue;

    // Dedupe against our DB by platform_message_id.
    const { data: existing } = await admin
      .from("messages")
      .select("id")
      .eq("platform_message_id", fromCustomer.id)
      .maybeSingle();
    if (existing) continue;

    // Route through the normal inbound pipeline — this will persist the
    // message, fire typing, generate the AI reply, and send it (which
    // auto-accepts the request).
    try {
      await handleInbound({
        platform: "instagram",
        channelExternalId: businessId,
        contactExternalId: contact.id,
        contactName: contact.username,
        text: fromCustomer.message,
        platformMessageId: fromCustomer.id,
      });
      processed++;
    } catch (err) {
      console.error("[ig-requests] handleInbound failed", err);
    }
  }

  return { processed };
}

/** Process all active IG channels across every org that has auto-accept on. */
export async function acceptAllIgRequests(): Promise<{
  channels: number;
  total_processed: number;
  errors: number;
}> {
  const admin = createSupabaseAdminClient();
  const { data: channels } = await admin
    .from("channels")
    .select("id")
    .eq("platform", "instagram")
    .eq("auto_accept_requests", true)
    .eq("status", "active");

  let total = 0, errors = 0;
  for (const ch of channels ?? []) {
    const r = await acceptIgPendingRequests(ch.id as string).catch(() => ({ processed: 0, error: "throw" }));
    total += r.processed;
    if (r.error) errors++;
  }
  return { channels: (channels ?? []).length, total_processed: total, errors };
}
