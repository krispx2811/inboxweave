import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Fetch summaries of this contact's past resolved conversations on the same
 * channel so the AI can greet returning customers with context ("You asked
 * about LASIK last week — ready to book?"). Limits to the 3 most recent
 * resolved conversations within the last 90 days that actually have a
 * stored summary. Cheap: one indexed query.
 */
export async function getContactMemory(
  orgId: string,
  channelId: string,
  contactExternalId: string,
  excludeConversationId?: string,
): Promise<string[]> {
  const admin = createSupabaseAdminClient();
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  let query = admin
    .from("conversations")
    .select("summary, resolved_at, category")
    .eq("org_id", orgId)
    .eq("channel_id", channelId)
    .eq("contact_external_id", contactExternalId)
    .not("summary", "is", null)
    .gte("last_message_at", ninetyDaysAgo)
    .order("last_message_at", { ascending: false })
    .limit(3);

  if (excludeConversationId) {
    query = query.neq("id", excludeConversationId);
  }

  const { data } = await query;
  return (data ?? [])
    .map((r) => {
      const summary = (r.summary as string | null)?.trim();
      if (!summary) return null;
      const when = r.resolved_at
        ? new Date(r.resolved_at as string).toLocaleDateString()
        : "previously";
      const cat = r.category ? ` (${r.category})` : "";
      return `• [${when}${cat}] ${summary}`;
    })
    .filter((s): s is string => Boolean(s));
}
