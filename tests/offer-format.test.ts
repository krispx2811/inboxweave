import assert from "node:assert/strict";
import { test } from "node:test";
import { localEndDate, offerLines, offersBlock } from "../src/lib/ai/offer-format.ts";
import { supportedAmounts } from "../src/lib/ai/price-guard.ts";

// An offer created in Oman (UTC+4, getTimezoneOffset = -240) ending 30 Nov:
// its last instant is 30 Nov 23:59:59.999 local = 30 Nov 19:59:59.999 UTC.
const offer = {
  title: "LASIK offer",
  details: "LASIK for both eyes is 450 OMR instead of 514 OMR.",
  ends_at: "2026-11-30T19:59:59.999Z",
  tz_offset_minutes: -240,
};

test("end date is shown in the business's own calendar", () => {
  assert.equal(localEndDate(offer), "2026-11-30");
  assert.equal(localEndDate({ ...offer, ends_at: null }), null);
});

test("offer lines carry title, end date and details", () => {
  assert.deepEqual(offerLines([offer]), [
    "• LASIK offer (valid until 2026-11-30): LASIK for both eyes is 450 OMR instead of 514 OMR.",
  ]);
});

test("offer prices count as current for the price guard", () => {
  const live = supportedAmounts(offerLines([offer]));
  assert.ok(live.has("450"));
});

test("no block without offers", () => {
  assert.equal(offersBlock([]), "");
  assert.match(offersBlock([offer]), /OVERRIDE THE KNOWLEDGE BASE/);
});
