import assert from "node:assert/strict";
import { test } from "node:test";
import { formatForPlatform, stripMarkdown } from "../src/lib/channels/format.ts";

const reply = "## Offer\n**LASIK** is **456 OMR**.\n- 5-year warranty\n- Free follow-ups";

test("Instagram and Messenger get plain text", () => {
  assert.equal(
    formatForPlatform(reply, "instagram"),
    "Offer\nLASIK is 456 OMR.\n• 5-year warranty\n• Free follow-ups",
  );
  assert.equal(formatForPlatform(reply, "messenger"), formatForPlatform(reply, "instagram"));
});

test("WhatsApp gets its own bold syntax", () => {
  assert.equal(
    formatForPlatform(reply, "whatsapp"),
    "Offer\n*LASIK* is *456 OMR*.\n• 5-year warranty\n• Free follow-ups",
  );
});

test("Arabic with bold and Arabic punctuation", () => {
  assert.equal(formatForPlatform("سعر **الليزك** هو **456 ريال**؟", "instagram"), "سعر الليزك هو 456 ريال؟");
});

test("links keep their URL", () => {
  assert.equal(
    formatForPlatform("See [our page](https://instagram.com/x).", "instagram"),
    "See our page (https://instagram.com/x).",
  );
});

test("single asterisks used as emphasis are dropped, multiplication is not touched", () => {
  assert.equal(formatForPlatform("this is *important* ok", "instagram"), "this is important ok");
  assert.equal(formatForPlatform("2 * 3 = 6", "instagram"), "2 * 3 = 6");
});

test("stripMarkdown for inbox previews", () => {
  assert.equal(stripMarkdown("**LASIK** — **456 OMR**"), "LASIK — 456 OMR");
});
