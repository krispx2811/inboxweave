import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReplyMessages } from "../src/lib/ai/reply-prompt.ts";

const offer = {
  title: "Eye surgery offer",
  details: "LASIK -456 OMR\nICL -900 OMR",
  ends_at: null,
  tz_offset_minutes: -240,
};
const base = {
  systemPrompt: "You are the clinic assistant.",
  userMessage: "Any offers",
  history: [{ role: "assistant" as const, content: "LASIK is 514 OMR." }],
  retrievedContext: ["| LASIK | 514 OMR |", "For offers, see our Instagram page."],
};

test("offers come last in the system prompt, after the knowledge base and precedence", () => {
  const system = buildReplyMessages({ ...base, offers: [offer] })[0]!.content;
  const kb = system.indexOf("KNOWLEDGE BASE —");
  const precedence = system.indexOf("SOURCE PRECEDENCE");
  const offers = system.indexOf("CURRENT OFFERS");
  assert.ok(kb >= 0 && precedence > kb && offers > precedence);
  assert.match(system, /replaces any knowledge-base instruction to send customers to Instagram/);
});

test("no offers block when nothing is running", () => {
  const system = buildReplyMessages({ ...base, offers: [] })[0]!.content;
  assert.equal(system.includes("CURRENT OFFERS"), false);
});

test("an offer price in history survives; an ended offer's price is redacted", () => {
  const withOffer = { ...base, history: [{ role: "assistant" as const, content: "LASIK is 456 OMR on offer." }] };
  const live = buildReplyMessages({ ...withOffer, offers: [offer] });
  assert.match(live[1]!.content, /456 OMR/);
  const ended = buildReplyMessages({ ...withOffer, offers: [] });
  assert.doesNotMatch(ended[1]!.content, /456 OMR/);
});
