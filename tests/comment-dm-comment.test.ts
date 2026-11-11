import assert from "node:assert/strict";
import { test } from "node:test";
import { PUBLIC_REPLY_HOURLY_CAP, clip, handleComment, handleTap } from "../src/lib/comment-dm/flow.ts";
import { decodePayload, encodePayload } from "../src/lib/comment-dm/parse.ts";
import { DEFAULT_TEXTS, pickPublicReply } from "../src/lib/comment-dm/texts.ts";
import type { CommentDmSettings } from "../src/lib/comment-dm/types.ts";
import { ACCOUNT_ID, comment, makeFakes, payloadOf, tap } from "./helpers/comment-dm-fakes.ts";

test("replies under the comment and sends the first DM with a button", async () => {
  const f = makeFakes();
  assert.equal(await handleComment(comment(), f.deps), "dm_sent");

  assert.deepEqual(f.sent.map((s) => s.kind), ["private", "public"]);
  assert.equal(f.sent[1]!.target, "c-1");
  assert.ok(DEFAULT_TEXTS.en.publicReply.split("\n").includes(f.sent[1]!.text!));
  const dm = f.sent[0]!.msg!;
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
  assert.ok(DEFAULT_TEXTS.ar.publicReply.split("\n").includes(f.sent[1]!.text!));
  assert.equal(f.sent[0]!.msg!.text, DEFAULT_TEXTS.ar.opening);
  assert.equal([...f.events.values()][0]!.language, "ar");
});

test("uses the account's default language when the comment has no words", async () => {
  const f = makeFakes({ settings: { defaultLanguage: "ar" } });
  await handleComment(comment({ text: "🔥🔥" }), f.deps);
  assert.equal(f.sent[0]!.msg!.text, DEFAULT_TEXTS.ar.opening);
});

test("uses the owner's own texts when set", async () => {
  const f = makeFakes({ settings: { texts: { en: { opening: "Want the trial? Tap below." } } } });
  await handleComment(comment(), f.deps);
  assert.equal(f.sent[0]!.msg!.text, "Want the trial? Tap below.");
  assert.equal(f.sent[0]!.msg!.button.title, DEFAULT_TEXTS.en.openingButton);
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
  assert.equal(f.sent.length, 0, "no public reply when the DM failed");

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

test("if saving the inbox copy fails after the DM, the DM is still recorded and the button works", async () => {
  for (const hook of ["ensure", "log"] as const) {
    const f = makeFakes();
    if (hook === "ensure") f.state.failEnsureConversation = "db down";
    else f.state.failLogMessage = "out";
    assert.equal(await handleComment(comment(), f.deps), "dm_sent");
    const event = [...f.events.values()][0]!;
    assert.equal(event.status, "dm_sent");
    assert.equal(event.recipientId, "igsid-1");
    assert.match(event.error ?? "", /^inbox:/);
    assert.deepEqual(f.sent.map((s) => s.kind), ["private", "public"]);

    f.state.failEnsureConversation = undefined;
    f.state.failLogMessage = undefined;
    f.sent.length = 0;
    assert.equal(await handleTap(tap(encodePayload(event.id)), f.deps), "link_sent");
  }
});

test("a stale pending row is retried by the next comment, a dm_sent row never is", async () => {
  const f = makeFakes();
  f.state.stalePending = true;
  const claimed = await f.deps.store.claimEvent({
    orgId: "org-1",
    channelId: "ch-1",
    mediaId: "media-1",
    commenterId: "commenter-1",
    commenterUsername: "sara",
    commentId: "c-0",
    commentText: "hi",
    language: "en",
  });
  assert.equal(claimed!.status, "pending"); // left pending: the process died
  assert.equal(await handleComment(comment({ commentId: "c-2" }), f.deps), "dm_sent");
  assert.equal(f.events.size, 1);
  assert.equal(await handleComment(comment({ commentId: "c-3" }), f.deps), "already_sent");
  assert.equal(f.sent.filter((s) => s.kind === "private").length, 1);
});

test("stored errors are at most 300 code points and never split an emoji", async () => {
  const f = makeFakes({ privateReplyError: "x".repeat(1000) });
  await handleComment(comment(), f.deps);
  assert.equal(Array.from([...f.events.values()][0]!.error!).length, 300);

  const g = makeFakes({ privateReplyError: "😀".repeat(400) });
  await handleComment(comment(), g.deps);
  const err = [...g.events.values()][0]!.error!;
  assert.equal(Array.from(err).length, 300);
  assert.equal(err, "😀".repeat(300));

  const h = makeFakes({ publicReplyError: "😀".repeat(400) });
  await handleComment(comment(), h.deps);
  const combined = [...h.events.values()][0]!.error!;
  assert.equal(Array.from(combined).length, 300);
  assert.ok(combined.startsWith("public reply: "));
});

test("clip cuts by code points", () => {
  assert.equal(clip("abc", 5), "abc");
  assert.equal(clip("😀😀😀", 2), "😀😀");
  assert.equal(Array.from(clip("a".repeat(500))).length, 300);
});

test("a long comment is stored clipped to 500 code points", async () => {
  const f = makeFakes();
  let stored = "";
  const orig = f.deps.store.claimEvent;
  f.deps.store.claimEvent = async (input) => {
    stored = input.commentText;
    return orig(input);
  };
  await handleComment(comment({ text: "😀".repeat(600) }), f.deps);
  assert.equal(stored, "😀".repeat(500));
});

test("the public reply is the variant picked with the injected random", async () => {
  const f = makeFakes({ settings: { texts: { en: { publicReply: "one\ntwo\nthree" } } } });
  f.deps.random = () => 0.5;
  await handleComment(comment(), f.deps);
  assert.equal(f.sent[1]!.text, "two");
  assert.equal(pickPublicReply("one\ntwo\nthree", () => 0.5), "two");
});

test("the inbox copy is saved before the public reply", async () => {
  const f = makeFakes();
  await handleComment(comment(), f.deps);
  assert.deepEqual(f.calls, ["private", "inbox", "public"]);
});

test("at the hourly cap the public reply is skipped but the DM still goes out", async () => {
  const f = makeFakes();
  f.state.recentDms = PUBLIC_REPLY_HOURLY_CAP;
  assert.equal(await handleComment(comment(), f.deps), "dm_sent");
  assert.deepEqual(f.sent.map((s) => s.kind), ["private"]);
  const [event] = [...f.events.values()];
  assert.equal(event!.status, "dm_sent");
  assert.match(event!.error!, /public reply skipped: more than 30 DMs in the last hour/);
});

test("just under the cap the public reply still goes out", async () => {
  const f = makeFakes();
  f.state.recentDms = PUBLIC_REPLY_HOURLY_CAP - 1;
  await handleComment(comment(), f.deps);
  assert.deepEqual(f.sent.map((s) => s.kind), ["private", "public"]);
});

test("if counting recent DMs fails, the public reply is still sent", async () => {
  const f = makeFakes();
  f.state.recentDms = "db down";
  assert.equal(await handleComment(comment(), f.deps), "dm_sent");
  assert.deepEqual(f.sent.map((s) => s.kind), ["private", "public"]);
  assert.equal([...f.events.values()][0]!.error, null);
});
