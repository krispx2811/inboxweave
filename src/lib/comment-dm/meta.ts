import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, pgByteaToBuffer } from "@/lib/crypto/secrets";
import {
  getCachedDecryptedToken,
  invalidateCachedDecryptedToken,
  setCachedDecryptedToken,
} from "@/lib/channels/cache";
import { isTokenError, markChannelUnhealthy } from "@/lib/channels/health";
import { refreshIgTokenIfStale } from "@/lib/channels/ig-token-refresh";
import { templateMessage } from "./templates";
import type { CommentDmMeta, FollowResult } from "./types";

// Comment-to-DM needs Instagram Business Login tokens, which use this host.
const GRAPH = "https://graph.instagram.com/v21.0";

interface Ctx {
  channelId: string;
  orgId: string;
  token: string;
}

async function channelCtx(channelId: string): Promise<Ctx> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("channels")
    .select("id, org_id, access_token_ciphertext, token_refreshed_at")
    .eq("id", channelId)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Channel not found");
  let token = getCachedDecryptedToken(channelId);
  if (!token) {
    token = decryptSecret(pgByteaToBuffer(data.access_token_ciphertext as unknown as string));
    setCachedDecryptedToken(channelId, token);
    // The same lazy 30-day refresh the DM path runs; never blocks the send.
    refreshIgTokenIfStale({
      channelId,
      orgId: data.org_id as string,
      token,
      refreshedAt: (data.token_refreshed_at as string | null) ?? null,
    }).catch(() => {});
  }
  // Only Instagram Business Login tokens work on graph.instagram.com. A Facebook page token
  // would get code 190 and mark the whole channel unhealthy, so refuse before any Graph call.
  if (!token.startsWith("IGA")) {
    throw new Error("Comment to DM needs the account connected with Instagram login. Reconnect it from the Comment to DM page.");
  }
  return { channelId, orgId: data.org_id as string, token };
}

type GraphCall =
  | { method: "GET"; query?: Record<string, string> }
  | { method: "POST"; body: Record<string, unknown> };

class GraphError extends Error {
  constructor(
    message: string,
    readonly tokenError: boolean,
  ) {
    super(message);
  }
}

async function graph<T = unknown>(
  ctx: Ctx,
  path: string,
  call: GraphCall,
  dead: Map<string, string>,
): Promise<T> {
  const url = new URL(`${GRAPH}/${path}`);
  let res: Response;
  if (call.method === "GET") {
    for (const [k, v] of Object.entries(call.query ?? {})) url.searchParams.set(k, v);
    url.searchParams.set("access_token", ctx.token);
    res = await fetch(url);
  } else {
    // Same as sendInstagramText: the token goes in the JSON body.
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...call.body, access_token: ctx.token }),
    });
  }
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number } };
  if (!res.ok || json.error) {
    const code = json.error?.code;
    const message = `${json.error?.message || res.statusText || `HTTP ${res.status}`}${code ? ` (code ${code})` : ""}`;
    const tokenError = code === 190 || isTokenError(message);
    if (tokenError) {
      invalidateCachedDecryptedToken(ctx.channelId);
      // Only the first lane to see the dead token marks the channel (one disconnect email).
      if (!dead.has(ctx.channelId)) {
        dead.set(ctx.channelId, message);
        await markChannelUnhealthy({
          channelId: ctx.channelId,
          orgId: ctx.orgId,
          platform: "instagram",
          error: message,
        }).catch(() => {});
      }
    }
    throw new GraphError(message, tokenError);
  }
  return json as T;
}

export function createMeta(): CommentDmMeta {
  // One channel row read per batch. A failed lookup is never kept, and a token error
  // drops the entry so the next call reads the channel (and its token) afresh.
  const cache = new Map<string, Promise<Ctx>>();
  const ctxFor = (channelId: string): Promise<Ctx> => {
    let pending = cache.get(channelId);
    if (!pending) {
      pending = channelCtx(channelId);
      cache.set(channelId, pending);
      pending.catch(() => {
        if (cache.get(channelId) === pending) cache.delete(channelId);
      });
    }
    return pending;
  };
  // Channels whose token died during this batch: later calls fail at once, with no Graph call.
  const dead = new Map<string, string>();
  const call = async <T>(channelId: string, run: (ctx: Ctx) => Promise<T>): Promise<T> => {
    const known = dead.get(channelId);
    if (known !== undefined) throw new GraphError(known, true);
    const ctx = await ctxFor(channelId);
    try {
      return await run(ctx);
    } catch (err) {
      if (err instanceof GraphError && err.tokenError) cache.delete(channelId);
      throw err;
    }
  };

  return {
    async replyToComment(channelId, commentId, text) {
      await call(channelId, (ctx) =>
        graph(ctx, `${encodeURIComponent(commentId)}/replies`, { method: "POST", body: { message: text } }, dead),
      );
    },

    async sendPrivateReply(channelId, commentId, msg) {
      const res = await call(channelId, (ctx) =>
        graph<{ recipient_id?: string; message_id?: string }>(ctx, "me/messages", {
          method: "POST",
          body: { recipient: { comment_id: commentId }, message: templateMessage(msg) },
        }, dead),
      );
      return { messageId: res.message_id, recipientId: res.recipient_id };
    },

    async sendButtonMessage(channelId, recipientId, msg) {
      const res = await call(channelId, (ctx) =>
        graph<{ recipient_id?: string; message_id?: string }>(ctx, "me/messages", {
          method: "POST",
          body: { recipient: { id: recipientId }, message: templateMessage(msg) },
        }, dead),
      );
      return { messageId: res.message_id, recipientId: res.recipient_id };
    },

    async checkFollows(channelId, igsid): Promise<FollowResult> {
      try {
        const res = await call(channelId, (ctx) =>
          graph<{ is_user_follow_business?: unknown }>(ctx, encodeURIComponent(igsid), {
            method: "GET",
            query: { fields: "is_user_follow_business" },
          }, dead),
        );
        if (typeof res.is_user_follow_business !== "boolean") {
          return { ok: false, error: "follow status missing from Instagram's answer" };
        }
        return { ok: true, follows: res.is_user_follow_business };
      } catch (err) {
        return { ok: false, error: (err instanceof Error ? err.message : String(err)).slice(0, 200) };
      }
    },
  };
}
