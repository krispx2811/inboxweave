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
