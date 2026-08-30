import assert from "node:assert/strict";
import { test } from "node:test";
import {
  REDACTED,
  amountOf,
  redactUnsupportedAmounts,
  supportedAmounts,
} from "../src/lib/ai/price-guard.ts";

// The knowledge base as it stands after the Finland Eye Center correction.
const KB = [
  "| **ICL** | **starting from 1312 OMR** |",
  "| Eye check-up | 17 OMR |  | Driving license eye check-up | 5 OMR |",
  "| **Laser vision correction — LASIK** | 514 OMR |",
];
const live = supportedAmounts(KB);

test("collects every supported amount from the knowledge base", () => {
  assert.ok(live.has("1312"));
  assert.ok(live.has("514"));
  assert.ok(live.has("17"));
  assert.ok(live.has("5"));
});

test("redacts a pre-VAT price the knowledge base no longer supports", () => {
  const out = redactUnsupportedAmounts("ICL starts from 1250 OMR.", live);
  assert.equal(out, `ICL starts from ${REDACTED}.`);
});

test("keeps a price the knowledge base still supports", () => {
  const text = "ICL starts from 1312 OMR.";
  assert.equal(redactUnsupportedAmounts(text, live), text);
});

test("redacts the Arabic-currency form the AI actually used", () => {
  // 28 conversations quoted "490 ريال" — pre-VAT LASIK.
  const out = redactUnsupportedAmounts("سعر الليزك 490 ريال", live);
  assert.equal(out, `سعر الليزك ${REDACTED}`);
  assert.ok(!out.includes("490"));
});

test("handles Arabic-Indic numerals", () => {
  assert.equal(amountOf("١٢٥٠ ريال"), "1250");
  const out = redactUnsupportedAmounts("١٢٥٠ ريال", live);
  assert.equal(out, REDACTED);
});

test("treats thousands separators as equal to the bare number", () => {
  assert.equal(amountOf("1,312 OMR"), "1312");
  const text = "ICL is 1,312 OMR";
  assert.equal(redactUnsupportedAmounts(text, live), text);
});

test("NEVER touches phone numbers — they have no currency marker", () => {
  // Oman branch numbers from the Finland Eye Center prompt. Mangling these
  // would be far worse than a stale price.
  const text =
    "Qurum: Tel 24564488, WhatsApp 95302590. Sohar: 26846662 / 92175710. " +
    "Salalah: 23298515 / 77802424. Nizwa: 25433500 / 92541014. WhatsApp 94176872.";
  assert.equal(redactUnsupportedAmounts(text, live), text);
});

test("never touches bare numbers that are not money", () => {
  const text = "Open 8:00–17:00, 6 days a week. Ages 18 and older. Item code DPFMC-1.";
  assert.equal(redactUnsupportedAmounts(text, live), text);
});

test("redacts only the unsupported amount in a mixed sentence", () => {
  const out = redactUnsupportedAmounts(
    "Check-up is 17 OMR and ICL starts from 1250 OMR. Call 24564488.",
    live,
  );
  assert.ok(out.includes("17 OMR"));
  assert.ok(out.includes("24564488"));
  assert.ok(!out.includes("1250"));
});

test("is stable across repeated calls (no shared regex lastIndex)", () => {
  const text = "ICL starts from 1250 OMR.";
  const first = redactUnsupportedAmounts(text, live);
  for (let i = 0; i < 5; i++) {
    assert.equal(redactUnsupportedAmounts(text, live), first);
  }
});

test("an empty knowledge base yields no supported amounts", () => {
  // generateReply skips redaction entirely in this case, so nothing is blanked.
  assert.equal(supportedAmounts([]).size, 0);
});
