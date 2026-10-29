import "server-only";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { stripMarkdown } from "@/lib/channels/format";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export interface LatestMessage {
  direction: "in" | "out";
  sender: string;
  /** Plain text (Markdown markers removed), at most 240 chars. */
  preview: string;
  createdAt: string;
}

/** Last message of each conversation, keyed by conversation id. */
export async function getLatestMessages(
  admin: AdminClient,
  conversationIds: string[],
): Promise<Map<string, LatestMessage>> {
  const out = new Map<string, LatestMessage>();
  if (conversationIds.length === 0) return out;
  const { data, error } = await admin.rpc("latest_messages", { p_conversation_ids: conversationIds });
  // Previews are a nicety: a missing function (migration 0020 not applied)
  // or a read error leaves the list without them rather than failing it.
  if (error) {
    console.error("[inbox] latest_messages failed", error.message);
    return out;
  }
  for (const row of (data ?? []) as Array<{
    conversation_id: string;
    direction: "in" | "out";
    sender: string;
    content: string | null;
    created_at: string;
  }>) {
    out.set(row.conversation_id, {
      direction: row.direction,
      sender: row.sender,
      preview: stripMarkdown(row.content ?? "").replace(/\s+/g, " "),
      createdAt: row.created_at,
    });
  }
  return out;
}
