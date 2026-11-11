import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface CommentDmOverview {
  dmsSent: number;
  linksSent: number;
  awaitingFollow: number;
  failed: number;
  recentFailures: Array<{ id: string; commenterUsername: string | null; error: string | null; updatedAt: string }>;
}

/** All-time counts and the 5 latest failures for one channel's settings page. */
export async function getCommentDmOverview(channelId: string): Promise<CommentDmOverview> {
  const admin = createSupabaseAdminClient();
  const count = (statuses: string[]) =>
    admin
      .from("comment_dm_events")
      .select("id", { count: "exact", head: true })
      .eq("channel_id", channelId)
      .in("status", statuses);

  const [dms, links, waiting, failed, recent] = await Promise.all([
    count(["dm_sent", "awaiting_follow", "link_sent"]),
    count(["link_sent"]),
    count(["awaiting_follow"]),
    count(["failed"]),
    admin
      .from("comment_dm_events")
      .select("id, commenter_username, error, updated_at")
      .eq("channel_id", channelId)
      .eq("status", "failed")
      .order("updated_at", { ascending: false })
      .limit(5),
  ]);

  return {
    dmsSent: dms.count ?? 0,
    linksSent: links.count ?? 0,
    awaitingFollow: waiting.count ?? 0,
    failed: failed.count ?? 0,
    recentFailures: (recent.data ?? []).map((r) => ({
      id: r.id as string,
      commenterUsername: (r.commenter_username as string | null) ?? null,
      error: (r.error as string | null) ?? null,
      updatedAt: r.updated_at as string,
    })),
  };
}
