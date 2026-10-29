import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BACKGROUND_MODEL,
  CHAT_MODELS,
  DEFAULT_MODEL,
  chatRequestBody,
  classifyOpenAIError,
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
  assert.equal(body.temperature, undefined);
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

test("GPT-5.1+ keeps temperature unless the model refused it", () => {
  const body = chatRequestBody({ model: "gpt-5.4-mini", temperature: 0, messages });
  assert.equal(body.temperature, 0);
  const omitted = chatRequestBody({ model: "gpt-5.4-mini", temperature: 0, messages, omit: new Set(["temperature"]) });
  assert.equal("temperature" in omitted, false);
  assert.equal(omitted.reasoning_effort, "none");
  assert.equal(chatRequestBody({ model: "gpt-5-mini", temperature: 0, messages }).temperature, undefined);
});

test("OpenAI errors are classified by what to do next", () => {
  const err = (code: string, param?: string) => JSON.stringify({ error: { code, param } });
  assert.deepEqual(classifyOpenAIError(404, ""), { kind: "model" });
  assert.deepEqual(classifyOpenAIError(400, err("model_not_found")), { kind: "model" });
  assert.deepEqual(classifyOpenAIError(400, err("unsupported_parameter", "reasoning_effort")), {
    kind: "param",
    param: "reasoning_effort",
  });
  assert.deepEqual(classifyOpenAIError(400, err("unsupported_value", "temperature")), {
    kind: "param",
    param: "temperature",
  });
  // A refused parameter we don't control is a request problem, never dropped.
  assert.deepEqual(classifyOpenAIError(400, err("unsupported_value", "messages")), { kind: "request" });
  assert.deepEqual(classifyOpenAIError(400, err("invalid_image_url")), { kind: "request" });
  assert.deepEqual(classifyOpenAIError(400, err("context_length_exceeded")), { kind: "request" });
  assert.deepEqual(classifyOpenAIError(429, err("rate_limit_exceeded")), { kind: "request" });
  assert.deepEqual(classifyOpenAIError(400, "not json"), { kind: "request" });
});
