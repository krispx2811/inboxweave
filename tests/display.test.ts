import assert from "node:assert/strict";
import { test } from "node:test";
import { contactDisplayName, contactHandle, previewPrefix } from "../src/lib/inbox/display.ts";

test("name, then @username, never the raw numeric id", () => {
  assert.equal(contactDisplayName({ contact_name: "ᴷᴴ", contact_username: "_90.31" }), "ᴷᴴ");
  assert.equal(contactDisplayName({ contact_name: null, contact_username: "kareemalsaid_", contact_external_id: "1354170000000000" }), "@kareemalsaid_");
  assert.equal(contactDisplayName({ contact_external_id: "1354171234567890", platform: "instagram" }), "Instagram user ·7890");
});

test("WhatsApp ids are phone numbers", () => {
  assert.equal(contactDisplayName({ contact_external_id: "96891234567", platform: "whatsapp" }), "+96891234567");
});

test("handle only when there is a real name too", () => {
  assert.equal(contactHandle({ contact_name: "Sara", contact_username: "sara.om" }), "@sara.om");
  assert.equal(contactHandle({ contact_name: null, contact_username: "sara.om" }), null);
});

test("preview prefix by sender", () => {
  assert.equal(previewPrefix({ direction: "in", sender: "contact" }), "");
  assert.equal(previewPrefix({ direction: "out", sender: "ai" }), "AI: ");
  assert.equal(previewPrefix({ direction: "out", sender: "agent" }), "You: ");
});
