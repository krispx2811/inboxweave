import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_MODEL } from "../src/lib/ai/models.ts";
import { PERSONA_MAX_CHARS, parsePersonaForm } from "../src/lib/ai/persona.ts";

function form(systemPrompt: unknown, extra: { model?: unknown; temperature?: unknown } = {}) {
  return parsePersonaForm({ system_prompt: systemPrompt, model: "gpt-5.4-mini", temperature: "0.3", ...extra });
}

test("saves a long persona that the old 8,000-character cap rejected", () => {
  // The NuqtaPass persona is 13,513 characters as the browser submits it.
  const result = form("أ".repeat(13_513));
  assert.ok(result.ok);
  assert.equal(result.data.system_prompt.length, 13_513);
});

test("accepts a persona exactly at the limit", () => {
  assert.equal(form("a".repeat(PERSONA_MAX_CHARS)).ok, true);
});

test("over the limit, says how long it is instead of crashing", () => {
  assert.deepEqual(form("a".repeat(20_001)), {
    ok: false,
    error:
      "Your persona is 20,001 characters, and the limit is 20,000. Shorten it, or move long details like prices and FAQs into Knowledge.",
  });
});

test("an empty or missing persona asks for one", () => {
  const expected = { ok: false, error: "Write a persona before saving." };
  assert.deepEqual(form(""), expected);
  assert.deepEqual(form(null), expected);
});

test("a temperature outside 0 to 2 explains the range", () => {
  assert.deepEqual(form("Hi", { temperature: "5" }), {
    ok: false,
    error: "Temperature must be a number from 0 to 2.",
  });
});

test("keeps the model and temperature that were picked", () => {
  assert.deepEqual(form("Hi"), { ok: true, data: { system_prompt: "Hi", model: "gpt-5.4-mini", temperature: 0.3 } });
});

test("falls back to the default model when none is sent", () => {
  const result = form("Hi", { model: null });
  assert.ok(result.ok);
  assert.equal(result.data.model, DEFAULT_MODEL);
});
