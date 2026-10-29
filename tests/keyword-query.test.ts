import assert from "node:assert/strict";
import { test } from "node:test";
import { keywordQuery } from "../src/lib/ai/keyword-query.ts";

test("keeps distinctive words and ORs them", () => {
  assert.equal(keywordQuery("What is the price of LASIK surgery?"), "price or lasik or surgery");
});

test("handles Arabic and mixed messages", () => {
  assert.equal(
    keywordQuery("كم سعر عملية الليزك\nhow much is ICL"),
    "سعر or عملية or الليزك or icl",
  );
});

test("keeps prices and short numbers, drops single letters and duplicates", () => {
  assert.equal(keywordQuery("is it 490 OMR or 49 a b lasik LASIK"), "490 or omr or 49 or lasik");
});

test("returns an empty query for small talk", () => {
  assert.equal(keywordQuery("hi, thanks!"), "");
});

test("caps the number of terms", () => {
  const many = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
  assert.equal(keywordQuery(many).split(" or ").length, 12);
});
