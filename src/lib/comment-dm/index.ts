import "server-only";
import { handleComment, handleTap } from "./flow";
import { createMeta } from "./meta";
import { createStore } from "./store";
import type { CommentDmDeps, CommentEvent, TapEvent } from "./types";

function realDeps(): CommentDmDeps {
  return { store: createStore(), meta: createMeta() };
}

/** Run each new comment through the flow. One bad comment never stops the rest. */
export async function processCommentEvents(events: CommentEvent[]): Promise<void> {
  if (events.length === 0) return;
  const deps = realDeps();
  for (const ev of events) {
    try {
      const outcome = await handleComment(ev, deps);
      console.log(`[comment-dm] comment ${ev.commentId} on ${ev.mediaId}: ${outcome}`);
    } catch (err) {
      console.error(`[comment-dm] comment ${ev.commentId} failed`, err);
    }
  }
}

/** Run each button tap through the flow. One bad tap never stops the rest. */
export async function processTapEvents(events: TapEvent[]): Promise<void> {
  if (events.length === 0) return;
  const deps = realDeps();
  for (const ev of events) {
    try {
      const outcome = await handleTap(ev, deps);
      console.log(`[comment-dm] tap ${ev.mid}: ${outcome}`);
    } catch (err) {
      console.error(`[comment-dm] tap ${ev.mid} failed`, err);
    }
  }
}
