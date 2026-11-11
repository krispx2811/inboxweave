import assert from "node:assert/strict";
import { test } from "node:test";
import { templateMessage } from "../src/lib/comment-dm/templates.ts";

test("builds a button template with a postback button", () => {
  assert.deepEqual(
    templateMessage({ text: "Tap below", button: { type: "postback", title: "Send me the link", payload: "cdm:x" } }, "button"),
    {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Tap below",
          buttons: [{ type: "postback", title: "Send me the link", payload: "cdm:x" }],
        },
      },
    },
  );
});

test("builds a button template with a link button", () => {
  assert.deepEqual(
    templateMessage({ text: "Here's your link", button: { type: "web_url", title: "Open link", url: "https://example.com" } }, "button"),
    {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Here's your link",
          buttons: [{ type: "web_url", title: "Open link", url: "https://example.com" }],
        },
      },
    },
  );
});

test("the generic fallback splits long text into title and subtitle", () => {
  const text = "a".repeat(100);
  assert.deepEqual(templateMessage({ text, button: { type: "postback", title: "Go", payload: "cdm:x" } }, "generic"), {
    attachment: {
      type: "template",
      payload: {
        template_type: "generic",
        elements: [{ title: "a".repeat(80), subtitle: "a".repeat(20), buttons: [{ type: "postback", title: "Go", payload: "cdm:x" }] }],
      },
    },
  });
});

test("the generic fallback leaves out an empty subtitle", () => {
  assert.deepEqual(templateMessage({ text: "Hi", button: { type: "postback", title: "Go", payload: "cdm:x" } }, "generic"), {
    attachment: {
      type: "template",
      payload: { template_type: "generic", elements: [{ title: "Hi", buttons: [{ type: "postback", title: "Go", payload: "cdm:x" }] }] },
    },
  });
});
