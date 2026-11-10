import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decodePayload,
  encodePayload,
  parseCommentEvents,
  parseTapEvents,
} from "../src/lib/comment-dm/parse.ts";

const ACCOUNT = "17841400000000001";
const EVENT_ID = "0b5f8c1e-6a3d-4f7b-9c2e-1d4a5b6c7d8e";

test("reads a comment", () => {
  const body = {
    object: "instagram",
    entry: [{
      id: ACCOUNT,
      time: 1731300000,
      changes: [{
        field: "comments",
        value: {
          id: "17900000000000001",
          text: "كم السعر؟",
          from: { id: "17800000000000009", username: "sara" },
          media: { id: "18000000000000003", media_product_type: "REELS" },
        },
      }],
    }],
  };
  assert.deepEqual(parseCommentEvents(body), [{
    accountId: ACCOUNT,
    commentId: "17900000000000001",
    mediaId: "18000000000000003",
    commenterId: "17800000000000009",
    commenterUsername: "sara",
    text: "كم السعر؟",
  }]);
});

test("skips comments missing the post or the author, and other fields", () => {
  const body = {
    entry: [{
      id: ACCOUNT,
      changes: [
        { field: "comments", value: { id: "1", text: "hi", from: { id: "2" } } },
        { field: "comments", value: { id: "1", text: "hi", media: { id: "3" } } },
        { field: "messages", value: { sender: { id: "2" }, message: { text: "hi" } } },
      ],
    }],
  };
  assert.deepEqual(parseCommentEvents(body), []);
});

test("a comment with no text reads as empty text", () => {
  const body = { entry: [{ id: ACCOUNT, changes: [{ field: "comments", value: { id: "1", from: { id: "2" }, media: { id: "3" } } }] }] };
  assert.equal(parseCommentEvents(body)[0]!.text, "");
});

test("ignores bodies that aren't webhooks", () => {
  assert.deepEqual(parseCommentEvents(null), []);
  assert.deepEqual(parseCommentEvents({}), []);
  assert.deepEqual(parseTapEvents("nope"), []);
});

test("reads a button tap from entry.messaging", () => {
  const body = {
    object: "instagram",
    entry: [{
      id: ACCOUNT,
      messaging: [{
        sender: { id: "igsid-1" },
        recipient: { id: ACCOUNT },
        timestamp: 1731300000000,
        postback: { mid: "mid-1", title: "Send me the link", payload: `cdm:${EVENT_ID}` },
      }],
    }],
  };
  assert.deepEqual(parseTapEvents(body), [{
    accountId: ACCOUNT,
    senderId: "igsid-1",
    mid: "mid-1",
    title: "Send me the link",
    payload: `cdm:${EVENT_ID}`,
  }]);
});

test("reads a tap delivered as a messaging_postbacks change, without a mid", () => {
  const body = {
    entry: [{
      id: ACCOUNT,
      changes: [{
        field: "messaging_postbacks",
        value: { sender: { id: "igsid-1" }, timestamp: 5, postback: { title: "I followed ✅", payload: `cdm:${EVENT_ID}` } },
      }],
    }],
  };
  const [tap] = parseTapEvents(body);
  assert.equal(tap!.title, "I followed ✅");
  assert.equal(tap!.mid, "postback:igsid-1:5");
});

test("ordinary DMs are not taps", () => {
  const body = {
    entry: [{ id: ACCOUNT, messaging: [{ sender: { id: "igsid-1" }, recipient: { id: ACCOUNT }, message: { mid: "m", text: "hi" } }] }],
  };
  assert.deepEqual(parseTapEvents(body), []);
});

test("payloads round-trip, and only our own decode", () => {
  assert.equal(decodePayload(encodePayload(EVENT_ID)), EVENT_ID);
  assert.equal(decodePayload(`cdm:${EVENT_ID.toUpperCase()}`), EVENT_ID);
  assert.equal(decodePayload("cdm:not-a-uuid"), null);
  assert.equal(decodePayload(`other:${EVENT_ID}`), null);
  assert.equal(decodePayload(""), null);
  assert.equal(decodePayload(undefined), null);
});

test("parsers never throw on odd webhook bodies", () => {
  const bodies = [
    { entry: [null] },
    { entry: ["x", 5] },
    { entry: [{ id: ACCOUNT, changes: {} }] },
    { entry: [{ id: ACCOUNT, changes: [null] }] },
    { entry: [{ id: ACCOUNT, changes: ["x"] }] },
    { entry: [{ id: ACCOUNT, messaging: {} }] },
    { entry: [{ id: ACCOUNT, messaging: [null] }] },
    { entry: [{ id: ACCOUNT, standby: "x" }] },
    { entry: [{ id: ACCOUNT, changes: [{ field: "messaging_postbacks", value: "x" }] }] },
    { entry: [{ id: ACCOUNT, messaging: [{ sender: { id: "1" }, postback: "x" }] }] },
  ];
  for (const body of bodies) {
    assert.deepEqual(parseCommentEvents(body), []);
    assert.deepEqual(parseTapEvents(body), []);
  }
});

test("a numeric payload is not a tap", () => {
  const body = { entry: [{ id: ACCOUNT, messaging: [{ sender: { id: "1" }, postback: { mid: "m", payload: 5 } }] }] };
  assert.deepEqual(parseTapEvents(body), []);
});

test("a non-string username reads as no username", () => {
  const body = { entry: [{ id: ACCOUNT, changes: [{ field: "comments", value: { id: "1", text: "hi", from: { id: "2", username: 42 }, media: { id: "3" } } }] }] };
  const [event] = parseCommentEvents(body);
  assert.equal(event!.commenterUsername, undefined);
});

test("reads a tap from entry.standby", () => {
  const body = { entry: [{ id: ACCOUNT, standby: [{ sender: { id: "igsid-1" }, postback: { mid: "mid-s", title: "t", payload: `cdm:${EVENT_ID}` } }] }] };
  assert.equal(parseTapEvents(body)[0]!.mid, "mid-s");
});

test("an entry with no id is skipped", () => {
  const comment = { entry: [{ changes: [{ field: "comments", value: { id: "1", from: { id: "2" }, media: { id: "3" } } }] }] };
  const tap = { entry: [{ messaging: [{ sender: { id: "1" }, postback: { mid: "m", payload: "p" } }] }] };
  assert.deepEqual(parseCommentEvents(comment), []);
  assert.deepEqual(parseTapEvents(tap), []);
});

test("an empty mid falls back to the timestamp key", () => {
  const body = { entry: [{ id: ACCOUNT, messaging: [{ sender: { id: "igsid-1" }, timestamp: 7, postback: { mid: "", payload: `cdm:${EVENT_ID}` } }] }] };
  assert.equal(parseTapEvents(body)[0]!.mid, "postback:igsid-1:7");
});

test("a tap with neither mid nor timestamp is skipped", () => {
  const body = { entry: [{ id: ACCOUNT, messaging: [{ sender: { id: "igsid-1" }, postback: { payload: `cdm:${EVENT_ID}` } }] }] };
  assert.deepEqual(parseTapEvents(body), []);
});
