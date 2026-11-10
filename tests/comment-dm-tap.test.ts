import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_TAPS, handleComment, handleTap } from "../src/lib/comment-dm/flow.ts";
import { decodePayload, encodePayload } from "../src/lib/comment-dm/parse.ts";
import { DEFAULT_TEXTS } from "../src/lib/comment-dm/texts.ts";
import type { CommentEvent } from "../src/lib/comment-dm/types.ts";
import { comment, makeFakes, payloadOf, tap, type FakeOptions } from "./helpers/comment-dm-fakes.ts";

/** Someone commented and got the first DM. Returns the fakes, ready for taps. */
async function afterFirstDm(opts: FakeOptions = {}, commentOver: Partial<CommentEvent> = {}) {
  const f = makeFakes(opts);
  assert.equal(await handleComment(comment(commentOver), f.deps), "dm_sent");
  const event = [...f.events.values()][0]!;
  f.sent.length = 0; // only look at what the taps send
  return { f, event, payload: encodePayload(event.id) };
}

test("a follower gets the link", async () => {
  const { f, event, payload } = await afterFirstDm();
  assert.equal(await handleTap(tap(payload), f.deps), "link_sent");

  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0]!.target, "igsid-1");
  const msg = f.sent[0]!.msg!;
  assert.equal(msg.text, DEFAULT_TEXTS.en.linkMessage);
  assert.deepEqual(msg.button, { type: "web_url", title: DEFAULT_TEXTS.en.linkButton, url: "https://example.com/trial" });

  const updated = f.events.get(event.id)!;
  assert.equal(updated.status, "link_sent");
  assert.equal(updated.tapCount, 1);
  // The first DM, the tap, the link.
  assert.deepEqual(f.messages.map((m) => m.direction), ["out", "in", "out"]);
  assert.equal(f.messages[1]!.content, "Send me the link");
  assert.equal(f.messages[1]!.sender, "contact");
});

test("a non-follower is asked to follow, then gets the link after tapping again", async () => {
  const { f, event, payload } = await afterFirstDm({ follow: { ok: true, follows: false } });
  assert.equal(await handleTap(tap(payload), f.deps), "awaiting_follow");
  const ask = f.sent[0]!.msg!;
  assert.equal(ask.text, DEFAULT_TEXTS.en.followFirst);
  assert.equal(ask.button.title, DEFAULT_TEXTS.en.followedButton);
  assert.equal(decodePayload(payloadOf(ask)), event.id);
  assert.equal(f.events.get(event.id)!.status, "awaiting_follow");

  f.state.follow = { ok: true, follows: true };
  assert.equal(await handleTap(tap(payload, { mid: "tap-2", title: "I followed ✅" }), f.deps), "link_sent");
  assert.equal(f.sent[1]!.msg!.button.type, "web_url");
  assert.equal(f.events.get(event.id)!.tapCount, 2);
});

test("if Instagram's follow check fails, the link is sent anyway", async () => {
  const { f, event, payload } = await afterFirstDm({ follow: { ok: false, error: "Rate limit hit" } });
  assert.equal(await handleTap(tap(payload), f.deps), "link_sent");
  assert.equal(f.events.get(event.id)!.error, "follow check: Rate limit hit");
});

test("with require follow off, the link goes out without a follow check", async () => {
  const { f, payload } = await afterFirstDm({ settings: { requireFollow: false } });
  assert.equal(await handleTap(tap(payload), f.deps), "link_sent");
  assert.equal(f.followChecks(), 0);
});

test("answers in the language of the original comment", async () => {
  const { f, payload } = await afterFirstDm({}, { text: "أبي الرابط" });
  await handleTap(tap(payload, { title: "أرسل لي الرابط" }), f.deps);
  assert.equal(f.sent[0]!.msg!.text, DEFAULT_TEXTS.ar.linkMessage);
});

test("ignores buttons that aren't ours or point at unknown events", async () => {
  const { f } = await afterFirstDm();
  assert.equal(await handleTap(tap("SOMETHING_ELSE"), f.deps), "not_ours");
  assert.equal(await handleTap(tap(encodePayload("00000000-0000-4000-8000-999999999999")), f.deps), "unknown_event");
  assert.equal(f.sent.length, 0);
});

test("only the person we DMed, on the account we DMed from, can use the button", async () => {
  const { f, payload } = await afterFirstDm();
  assert.equal(await handleTap(tap(payload, { senderId: "someone-else" }), f.deps), "mismatch");
  assert.equal(await handleTap(tap(payload, { accountId: "17841499999999999" }), f.deps), "mismatch");
  assert.equal(f.sent.length, 0);
});

test("the same tap delivered twice is answered once", async () => {
  const { f, payload } = await afterFirstDm();
  assert.equal(await handleTap(tap(payload), f.deps), "link_sent");
  assert.equal(await handleTap(tap(payload), f.deps), "duplicate");
  assert.equal(f.sent.length, 1);
});

test(`stops answering after ${MAX_TAPS} taps`, async () => {
  const { f, payload } = await afterFirstDm({ follow: { ok: true, follows: false } });
  for (let i = 1; i <= MAX_TAPS; i++) {
    assert.equal(await handleTap(tap(payload, { mid: `tap-${i}` }), f.deps), "awaiting_follow");
  }
  assert.equal(await handleTap(tap(payload, { mid: "tap-extra" }), f.deps), "tap_limit");
  assert.equal(f.sent.length, MAX_TAPS);
});

test("still answers after the owner turned the feature off", async () => {
  const { f, payload } = await afterFirstDm();
  f.state.settings = { ...f.state.settings!, enabled: false };
  assert.equal(await handleTap(tap(payload), f.deps), "link_sent");
});

test("marks the event failed when the link was removed", async () => {
  const { f, event, payload } = await afterFirstDm();
  f.state.settings = { ...f.state.settings!, linkUrl: null };
  assert.equal(await handleTap(tap(payload), f.deps), "no_link");
  assert.equal(f.events.get(event.id)!.status, "failed");
  assert.equal(f.events.get(event.id)!.error, "no link set");
  assert.equal(f.sent.length, 0);
});

test("a failed send marks the event failed", async () => {
  const { f, event, payload } = await afterFirstDm({ dmError: "User can't receive messages" });
  assert.equal(await handleTap(tap(payload), f.deps), "failed");
  assert.equal(f.events.get(event.id)!.status, "failed");
  assert.equal(f.events.get(event.id)!.error, "User can't receive messages");
});
