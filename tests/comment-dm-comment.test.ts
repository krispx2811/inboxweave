import assert from "node:assert/strict";
import { test } from "node:test";
import { handleComment } from "../src/lib/comment-dm/flow.ts";
import { decodePayload } from "../src/lib/comment-dm/parse.ts";
import { DEFAULT_TEXTS } from "../src/lib/comment-dm/texts.ts";
import type { CommentDmSettings } from "../src/lib/comment-dm/types.ts";
import { ACCOUNT_ID, comment, makeFakes, payloadOf } from "./helpers/comment-dm-fakes.ts";

test("replies under the comment and sends the first DM with a button", async () => {
  const f = makeFakes();
  assert.equal(await handleComment(comment(), f.deps), "dm_sent");

  assert.deepEqual(f.sent.map((s) => s.kind), ["public", "private"]);
  assert.equal(f.sent[0]!.target, "c-1");
  assert.equal(f.sent[0]!.text, DEFAULT_TEXTS.en.publicReply);
  const dm = f.sent[1]!.msg!;
  assert.equal(dm.text, DEFAULT_TEXTS.en.opening);
  assert.equal(dm.button.title, DEFAULT_TEXTS.en.openingButton);

  const [event] = [...f.events.values()];
  assert.equal(decodePayload(payloadOf(dm)), event!.id);
  assert.equal(event!.status, "dm_sent");
  assert.equal(event!.recipientId, "igsid-1");
  assert.equal(event!.conversationId, "conv-1");
  assert.equal(event!.error, null);

  assert.equal(f.messages.length, 1);
  assert.equal(f.messages[0]!.direction, "out");
  assert.equal(f.messages[0]!.sender, "ai");
  assert.equal(f.messages[0]!.platformMessageId, "mid-1");
  assert.match(f.messages[0]!.content, /\[Send me the link\]$/);
});

test("answers an Arabic comment in Arabic", async () => {
  const f = makeFakes();
  await handleComment(comment({ text: "كم السعر؟" }), f.deps);
  assert.equal(f.sent[0]!.text, DEFAULT_TEXTS.ar.publicReply);
  assert.equal(f.sent[1]!.msg!.text, DEFAULT_TEXTS.ar.opening);
  assert.equal([...f.events.values()][0]!.language, "ar");
});

test("uses the account's default language when the comment has no words", async () => {
  const f = makeFakes({ settings: { defaultLanguage: "ar" } });
  await handleComment(comment({ text: "🔥🔥" }), f.deps);
  assert.equal(f.sent[1]!.msg!.text, DEFAULT_TEXTS.ar.opening);
});

test("uses the owner's own texts when set", async () => {
  const f = makeFakes({ settings: { texts: { en: { opening: "Want the trial? Tap below." } } } });
  await handleComment(comment(), f.deps);
  assert.equal(f.sent[1]!.msg!.text, "Want the trial? Tap below.");
  assert.equal(f.sent[1]!.msg!.button.title, DEFAULT_TEXTS.en.openingButton);
});

test("ignores the account's own comments, by id or by username", async () => {
  const f = makeFakes();
  assert.equal(await handleComment(comment({ commenterId: ACCOUNT_ID }), f.deps), "own_comment");
  assert.equal(await handleComment(comment({ commenterUsername: "Shop" }), f.deps), "own_comment");
  assert.equal(f.sent.length, 0);
});

test("does nothing when the feature is off, has no link, or was never set up", async () => {
  const cases: Array<Partial<CommentDmSettings> | null> = [{ enabled: false }, { linkUrl: null }, null];
  for (const settings of cases) {
    const f = makeFakes({ settings });
    assert.equal(await handleComment(comment(), f.deps), "disabled");
    assert.equal(f.sent.length, 0);
    assert.equal(f.events.size, 0);
  }
});

test("does nothing while the channel needs reconnecting", async () => {
  const f = makeFakes({ channel: { status: "error" } });
  assert.equal(await handleComment(comment(), f.deps), "channel_inactive");
  assert.equal(f.sent.length, 0);
});

test("ignores comments on accounts we don't know", async () => {
  const f = makeFakes();
  assert.equal(await handleComment(comment({ accountId: "17841499999999999" }), f.deps), "no_channel");
});

test("one DM per person per post", async () => {
  const f = makeFakes();
  assert.equal(await handleComment(comment(), f.deps), "dm_sent");
  assert.equal(await handleComment(comment({ commentId: "c-2" }), f.deps), "already_sent");
  assert.equal(await handleComment(comment({ commentId: "c-3", mediaId: "media-2" }), f.deps), "dm_sent");
  assert.equal(f.sent.filter((s) => s.kind === "private").length, 2);
});

test("a failed DM is saved, and the person's next comment on that post retries it", async () => {
  const f = makeFakes({ privateReplyError: "Rate limit hit (code 4)" });
  assert.equal(await handleComment(comment(), f.deps), "failed");
  const [failed] = [...f.events.values()];
  assert.equal(failed!.status, "failed");
  assert.equal(failed!.error, "Rate limit hit (code 4)");
  assert.equal(f.messages.length, 0);

  f.state.privateReplyError = undefined;
  assert.equal(await handleComment(comment({ commentId: "c-2" }), f.deps), "dm_sent");
  assert.equal(f.events.size, 1);
  assert.equal([...f.events.values()][0]!.status, "dm_sent");
});

test("skips the public reply when it's turned off", async () => {
  const f = makeFakes({ settings: { publicReplyEnabled: false } });
  await handleComment(comment(), f.deps);
  assert.deepEqual(f.sent.map((s) => s.kind), ["private"]);
});

test("a failed public reply doesn't stop the DM", async () => {
  const f = makeFakes({ publicReplyError: "Comment was deleted" });
  assert.equal(await handleComment(comment(), f.deps), "dm_sent");
  assert.equal([...f.events.values()][0]!.error, "public reply: Comment was deleted");
});

test("falls back to the commenter's id when Meta returns no recipient id", async () => {
  const f = makeFakes({ recipientId: null });
  await handleComment(comment(), f.deps);
  assert.equal([...f.events.values()][0]!.recipientId, "commenter-1");
});
