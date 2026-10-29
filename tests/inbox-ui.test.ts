import assert from "node:assert/strict";
import { test } from "node:test";
import { parseInline, parseMarkdownLite } from "../src/components/inbox/markdown.ts";
import { clampCount, inboxHref, parseInboxState } from "../src/components/inbox/inbox-url.ts";
import { relativeTime } from "../src/components/inbox/time.ts";

test("bold, bullets and headings become blocks, not literal markers", () => {
  const blocks = parseMarkdownLite("## المواعيد\n**السبت** إلى الخميس\n\n- فحص النظر\n- الليزك\nشكراً");
  assert.deepEqual(blocks, [
    { kind: "p", lines: [[{ text: "المواعيد", bold: true }], [{ text: "السبت", bold: true }, { text: " إلى الخميس", bold: false }]] },
    { kind: "ul", items: [[{ text: "فحص النظر", bold: false }], [{ text: "الليزك", bold: false }]] },
    { kind: "p", lines: [[{ text: "شكراً", bold: false }]] },
  ]);
});

test("inline markup is data, never HTML", () => {
  assert.deepEqual(parseInline("<b>hi</b> **x**"), [
    { text: "<b>hi</b> ", bold: false },
    { text: "x", bold: true },
  ]);
  assert.deepEqual(parseInline("[Book](https://ex.com/a)"), [{ text: "Book (https://ex.com/a)", bold: false }]);
  assert.deepEqual(parseMarkdownLite("**bold** start"), [
    { kind: "p", lines: [[{ text: "bold", bold: true }, { text: " start", bold: false }]] },
  ]);
});

test("page sizes step, floor and cap", () => {
  assert.equal(clampCount(undefined, 40, 400), 40);
  assert.equal(clampCount("abc", 40, 400), 40);
  assert.equal(clampCount("80", 40, 400), 80);
  assert.equal(clampCount("81", 40, 400), 120);
  assert.equal(clampCount("99999", 60, 600), 600);
});

test("inbox state ignores junk and links omit defaults", () => {
  const s = parseInboxState({ c: "not-a-uuid", status: "weird", n: "40", m: "120" });
  assert.equal(s.c, undefined);
  assert.equal(s.status, undefined);
  const id = "0b5c5f1e-8e2a-4c1d-9a51-0c6a5c9f1e2a";
  const state = parseInboxState({ c: id, q: "سارة & co", m: "120", n: "80" });
  assert.equal(inboxHref("org", state), `/app/org/inbox?c=${id}&q=%D8%B3%D8%A7%D8%B1%D8%A9+%26+co&n=80&m=120`);
  assert.equal(inboxHref("org", state, { c: null }), "/app/org/inbox?q=%D8%B3%D8%A7%D8%B1%D8%A9+%26+co&n=80");
});

test("relative times", () => {
  const now = Date.parse("2026-10-29T12:00:00Z");
  assert.equal(relativeTime("2026-10-29T11:59:30Z", now), "now");
  assert.equal(relativeTime("2026-10-29T11:15:00Z", now), "45m");
  assert.equal(relativeTime("2026-10-29T02:00:00Z", now), "10h");
  assert.equal(relativeTime("2026-10-26T12:00:00Z", now), "3d");
  assert.equal(relativeTime("2026-09-01T12:00:00Z", now, false), "Sep 1");
});
