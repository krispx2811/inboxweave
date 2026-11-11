import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_TEXTS,
  TEXT_LIMITS,
  compactTexts,
  isHttpsUrl,
  parseSettingsForm,
  pickLanguage,
  pickPublicReply,
  resolveTexts,
  textFieldName,
} from "../src/lib/comment-dm/texts.ts";
import { TEXT_KEYS } from "../src/lib/comment-dm/types.ts";

test("Arabic comments get Arabic", () => {
  assert.equal(pickLanguage("كم السعر؟", "en"), "ar");
  assert.equal(pickLanguage("price please كم", "en"), "ar");
});

test("comments with other letters get English", () => {
  assert.equal(pickLanguage("I want it!", "ar"), "en");
  assert.equal(pickLanguage("je veux", "ar"), "en");
});

test("comments with no words use the account's default", () => {
  assert.equal(pickLanguage("🔥🔥", "ar"), "ar");
  assert.equal(pickLanguage("@sara.k_1 🔥", "ar"), "ar");
  assert.equal(pickLanguage("123 !!", "en"), "en");
  assert.equal(pickLanguage("", "ar"), "ar");
});

test("an @tag doesn't decide the language", () => {
  assert.equal(pickLanguage("@ahmed مرحبا", "en"), "ar");
});

test("default texts exist and fit Meta's limits in both languages", () => {
  for (const lang of ["en", "ar"] as const) {
    for (const key of TEXT_KEYS) {
      const text = DEFAULT_TEXTS[lang][key];
      assert.ok(text.length > 0, `${lang}.${key} is empty`);
      assert.ok(text.length <= TEXT_LIMITS[key], `${lang}.${key} is too long`);
      if (key === "publicReply") {
        const lines = text.split("\n");
        assert.equal(lines.length, 3, `${lang}.publicReply should have three variants`);
        for (const line of lines) assert.ok(line.length > 0 && line.length <= 300, `${lang} reply line too long`);
      }
    }
  }
});

test("the owner's texts win, and empty ones fall back to the defaults", () => {
  const texts = resolveTexts({ ar: { opening: "  هلا!  ", linkButton: "" } }, "ar");
  assert.equal(texts.opening, "هلا!");
  assert.equal(texts.linkButton, DEFAULT_TEXTS.ar.linkButton);
  assert.deepEqual(resolveTexts(null, "en"), DEFAULT_TEXTS.en);
});

test("only texts that differ from the defaults are kept", () => {
  assert.deepEqual(
    compactTexts({ en: { opening: DEFAULT_TEXTS.en.opening, linkMessage: "Your trial 🎉", linkButton: " " }, ar: {} }),
    { en: { linkMessage: "Your trial 🎉" } },
  );
});

test("links must be https", () => {
  assert.equal(isHttpsUrl("https://inboxweave.com/trial"), true);
  assert.equal(isHttpsUrl("http://inboxweave.com"), false);
  assert.equal(isHttpsUrl("javascript:alert(1)"), false);
  assert.equal(isHttpsUrl("https://user:pw@example.com"), false);
  assert.equal(isHttpsUrl("not a url"), false);
});

function form(values: Record<string, string>) {
  return (name: string) => values[name] ?? null;
}

test("reads the settings form", () => {
  const result = parseSettingsForm(form({
    linkUrl: " https://inboxweave.com/trial ",
    defaultLanguage: "ar",
    requireFollow: "on",
    [textFieldName("en", "linkMessage")]: "Your trial 🎉",
  }));
  assert.ok(result.success);
  assert.equal(result.data.linkUrl, "https://inboxweave.com/trial");
  assert.equal(result.data.defaultLanguage, "ar");
  assert.equal(result.data.requireFollow, true);
  assert.equal(result.data.publicReplyEnabled, false);
  assert.equal(result.data.texts.en.linkMessage, "Your trial 🎉");
});

test("an empty link is allowed while the feature is off", () => {
  assert.ok(parseSettingsForm(form({ linkUrl: "", defaultLanguage: "en" })).success);
});

test("rejects http links and long button labels with a readable message", () => {
  const http = parseSettingsForm(form({ linkUrl: "http://x.com", defaultLanguage: "en" }));
  assert.equal(http.success, false);
  assert.match(http.error!.issues[0]!.message, /https/);

  const long = parseSettingsForm(form({
    linkUrl: "",
    defaultLanguage: "en",
    [textFieldName("ar", "openingButton")]: "أ".repeat(21),
  }));
  assert.equal(long.success, false);
  assert.match(long.error!.issues[0]!.message, /First DM button \(Arabic\) can be at most 20 characters/);
});

test("digits, Arabic punctuation and emoji don't make a comment Arabic", () => {
  assert.equal(pickLanguage("٣", "en"), "en");
  assert.equal(pickLanguage("🔥؟", "en"), "en");
  assert.equal(pickLanguage("🔥؟", "ar"), "ar");
});

test("Arabic presentation forms count as Arabic letters", () => {
  assert.equal(pickLanguage("ﻻ", "en"), "ar");
});

test("the saved link is normalised", () => {
  const result = parseSettingsForm(form({ linkUrl: "https:example.com", defaultLanguage: "en" }));
  assert.ok(result.success);
  assert.equal(result.data.linkUrl, "https://example.com/");
});

test("non-string saved texts fall back instead of throwing", () => {
  const bad = { ar: { opening: 5, linkButton: null } } as unknown as Parameters<typeof resolveTexts>[0];
  const texts = resolveTexts(bad, "ar");
  assert.equal(texts.opening, DEFAULT_TEXTS.ar.opening);
  assert.equal(texts.linkButton, DEFAULT_TEXTS.ar.linkButton);
  assert.deepEqual(compactTexts(bad as Parameters<typeof compactTexts>[0]), {});
});

test("textarea line breaks submitted as CRLF count as one character", () => {
  const body = "ab\r\n".repeat(200); // 800 characters with CRLF, 600 once normalised
  const result = parseSettingsForm(form({ linkUrl: "", defaultLanguage: "en", [textFieldName("en", "opening")]: body }));
  assert.ok(result.success);
  assert.equal(result.data.texts.en.opening, "ab\n".repeat(200).trim());
});

test("pickPublicReply returns the only line, ignoring blank lines and spaces", () => {
  assert.equal(pickPublicReply("Sent you a DM"), "Sent you a DM");
  assert.equal(pickPublicReply("\n  Hello  \n\n"), "Hello");
});

test("pickPublicReply picks one of several lines using the random value", () => {
  const text = "one\n\n two \nthree";
  assert.equal(pickPublicReply(text, () => 0), "one");
  assert.equal(pickPublicReply(text, () => 0.5), "two");
  assert.equal(pickPublicReply(text, () => 0.99), "three");
  assert.equal(pickPublicReply(text, () => 1), "three");
});

test("a public reply line over 300 characters gets a readable message", () => {
  const bad = parseSettingsForm(form({
    linkUrl: "",
    defaultLanguage: "en",
    [textFieldName("en", "publicReply")]: `ok\n${"a".repeat(301)}`,
  }));
  assert.equal(bad.success, false);
  assert.match(bad.error!.issues[0]!.message, /Each public reply \(English\) can be at most 300 characters/);

  const good = parseSettingsForm(form({
    linkUrl: "",
    defaultLanguage: "en",
    [textFieldName("en", "publicReply")]: `${"a".repeat(300)}\n${"b".repeat(300)}`,
  }));
  assert.ok(good.success);

  const whole = parseSettingsForm(form({
    linkUrl: "",
    defaultLanguage: "en",
    [textFieldName("en", "publicReply")]: Array.from({ length: 8 }, () => "a".repeat(250)).join("\n"),
  }));
  assert.equal(whole.success, false);
  assert.match(whole.error!.issues[0]!.message, /at most 1500 characters/);
});
