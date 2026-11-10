import assert from "node:assert/strict";
import { test } from "node:test";
import { containsArabic } from "../src/lib/channels/language.ts";

test("detects Arabic letters anywhere in the text", () => {
  assert.equal(containsArabic("مرحبا"), true);
  assert.equal(containsArabic("price? كم"), true);
});

test("is false for Latin, emoji and empty input", () => {
  assert.equal(containsArabic("hello"), false);
  assert.equal(containsArabic("🔥🔥"), false);
  assert.equal(containsArabic(""), false);
  assert.equal(containsArabic(null), false);
  assert.equal(containsArabic(undefined), false);
});
