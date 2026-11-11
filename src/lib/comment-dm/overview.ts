import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface CommentDmProblem {
  id: string;
  status: string;
  commenterUsername: string | null;
  error: string | null;
  updatedAt: string;
}

export interface CommentDmOverview {
  dmsSent: number;
  linksSent: number;
  awaitingFollow: number;
  failed: number;
  /** Partial failures (an error on a row that isn't failed) plus rows stuck in pending. */
  warnings: number;
  recentProblems: CommentDmProblem[];
}

/** A row still `pending` after this long never finished sending. */
const STALE_PENDING_MS = 10 * 60 * 1000;

/** All-time counts and the 5 latest problems for one channel's settings page. */
export async function getCommentDmOverview(channelId: string): Promise<CommentDmOverview> {
  const admin = createSupabaseAdminClient();
  const staleBefore = new Date(Date.now() - STALE_PENDING_MS).toISOString();
  const count = (statuses: string[]) =>
    admin
      .from("comment_dm_events")
      .select("id", { count: "exact", head: true })
      .eq("channel_id", channelId)
      .in("status", statuses);
  const base = () =>
    admin.from("comment_dm_events").select("id", { count: "exact", head: true }).eq("channel_id", channelId);
  // A problem is a failed row, a row with an error, or a row stuck in pending.
  const problemFilter = `status.eq.failed,error.not.is.null,and(status.eq.pending,updated_at.lt.${staleBefore})`;

  const [dms, links, waiting, failed, partial, stuck, recent] = await Promise.all([
    count(["dm_sent", "awaiting_follow", "link_sent"]),
    count(["link_sent"]),
    count(["awaiting_follow"]),
    count(["failed"]),
    base().not("error", "is", null).neq("status", "failed"),
    base().eq("status", "pending").lt("updated_at", staleBefore),
    admin
      .from("comment_dm_events")
      .select("id, status, commenter_username, error, updated_at")
      .eq("channel_id", channelId)
      .or(problemFilter)
      .order("updated_at", { ascending: false })
      .limit(5),
  ]);

  return {
    dmsSent: dms.count ?? 0,
    linksSent: links.count ?? 0,
    awaitingFollow: waiting.count ?? 0,
    failed: failed.count ?? 0,
    warnings: (partial.count ?? 0) + (stuck.count ?? 0),
    recentProblems: (recent.data ?? []).map((r) => {
      const status = r.status as string;
      const error = (r.error as string | null) ?? null;
      return {
        id: r.id as string,
        status,
        commenterUsername: (r.commenter_username as string | null) ?? null,
        error: error ?? (status === "pending" ? "stuck — the DM may not have gone out" : null),
        updatedAt: r.updated_at as string,
      };
    }),
  };
}
