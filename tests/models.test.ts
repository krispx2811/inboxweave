import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BACKGROUND_MODEL,
  CHAT_MODELS,
  DEFAULT_MODEL,
  chatRequestBody,
  modelFallbackChain,
  modelPricing,
  supportsVision,
} from "../src/lib/ai/models.ts";

const messages = [{ role: "user", content: "hi" }];

test("GPT-4 models keep temperature and max_tokens", () => {
  const body = chatRequestBody({ model: "gpt-4o-mini", temperature: 0, max_tokens: 10, messages });
  assert.equal(body.temperature, 0);
  assert.equal(body.max_tokens, 10);
  assert.equal("max_completion_tokens" in body, false);
});

test("GPT-5 models drop temperature and use max_completion_tokens", () => {
  const body = chatRequestBody({ model: "gpt-5-mini", temperature: 0, max_tokens: 10, messages });
  assert.equal("temperature" in body, false);
  assert.equal("max_tokens" in body, false);
  assert.equal(body.max_completion_tokens, 10);
  assert.equal(body.reasoning_effort, "minimal");
});

test("GPT-5.x models turn reasoning off", () => {
  assert.equal(chatRequestBody({ model: "gpt-5.4-mini", messages }).reasoning_effort, "none");
  assert.equal(chatRequestBody({ model: "gpt-5.5", messages }).reasoning_effort, "none");
});

test("unknown models fall back to default pricing", () => {
  assert.deepEqual(modelPricing("nope"), modelPricing(DEFAULT_MODEL));
  assert.equal(modelPricing("gpt-5.5").completion, 30);
});

test("new models are used for vision", () => {
  assert.equal(supportsVision("gpt-5.4-mini"), true);
  assert.equal(supportsVision("nope"), false);
});

test("defaults are current models, not ones being retired", () => {
  for (const id of [DEFAULT_MODEL, BACKGROUND_MODEL]) {
    const model = CHAT_MODELS.find((m) => m.id === id);
    assert.ok(model, id);
    assert.equal(model.retiring, undefined);
  }
});

test("a retired model falls back to current ones", () => {
  const chain = modelFallbackChain("gpt-4.1-nano");
  assert.equal(chain[0], "gpt-4.1-nano");
  assert.equal(chain[1], DEFAULT_MODEL);
  assert.equal(new Set(chain).size, chain.length);
  assert.deepEqual(modelFallbackChain(DEFAULT_MODEL)[0], DEFAULT_MODEL);
  assert.equal(CHAT_MODELS.some((m) => m.id === "gpt-4.1-nano"), false);
});
