/**
 * Chat model catalogue and request shaping.
 *
 * GPT-5 family models are reasoning models and reject parameters the older
 * GPT-4 models accept: a custom `temperature` and `max_tokens` (replaced by
 * `max_completion_tokens`, which also covers hidden reasoning tokens). Every
 * chat request goes through `chatRequestBody` so the per-org model can be
 * switched without each call site knowing which family it belongs to.
 *
 * Pure and dependency-free so it can be unit-tested without a server context.
 */

export interface ChatModel {
  id: string;
  label: string;
  /** USD per 1M tokens. */
  pricing: { prompt: number; completion: number };
  /** Being retired by OpenAI; kept so orgs still on it keep working until then. */
  retiring?: boolean;
}

/** Customer replies, for orgs that haven't picked a model. */
export const DEFAULT_MODEL = "gpt-5.4-mini";

/** Background work on every message: classification, language detection, summaries. */
export const BACKGROUND_MODEL = "gpt-5.4-nano";

/** Last resort if the newer models are rejected (e.g. not enabled on the key). */
const LEGACY_FALLBACK = "gpt-4.1-mini";

export const CHAT_MODELS: ChatModel[] = [
  { id: "gpt-5.5", label: "GPT-5.5 (most capable)", pricing: { prompt: 5.0, completion: 30.0 } },
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini (fast, recommended)", pricing: { prompt: 0.75, completion: 4.5 } },
  { id: "gpt-5.4-nano", label: "GPT-5.4 Nano (cheapest new model)", pricing: { prompt: 0.2, completion: 1.25 } },
  { id: "gpt-5.4", label: "GPT-5.4", pricing: { prompt: 2.5, completion: 15.0 } },
  { id: "gpt-5.2", label: "GPT-5.2", pricing: { prompt: 1.75, completion: 14.0 } },
  { id: "gpt-5.1", label: "GPT-5.1", pricing: { prompt: 1.25, completion: 10.0 } },
  { id: "gpt-5", label: "GPT-5", pricing: { prompt: 1.25, completion: 10.0 } },
  { id: "gpt-5-mini", label: "GPT-5 Mini", pricing: { prompt: 0.25, completion: 2.0 } },
  { id: "gpt-5-nano", label: "GPT-5 Nano", pricing: { prompt: 0.05, completion: 0.4 } },
  { id: "gpt-4o-mini", label: "GPT-4o Mini", pricing: { prompt: 0.15, completion: 0.6 }, retiring: true },
  { id: "gpt-4o", label: "GPT-4o", pricing: { prompt: 5.0, completion: 15.0 }, retiring: true },
  { id: "gpt-4.1-mini", label: "GPT-4.1 Mini", pricing: { prompt: 0.4, completion: 1.6 }, retiring: true },
  { id: "gpt-4.1", label: "GPT-4.1", pricing: { prompt: 2.0, completion: 8.0 }, retiring: true },
];

/** Shut down by OpenAI; still priced so old usage rows keep their cost. */
const RETIRED_PRICING: Record<string, ChatModel["pricing"]> = {
  "gpt-4.1-nano": { prompt: 0.1, completion: 0.4 },
};

/**
 * Models to try, in order, for an org configured with `model`. A model that
 * OpenAI has shut down (or that the org's key can't use) must not silence the
 * AI, so a rejected request moves on to the current default and then to a
 * long-lived legacy model.
 */
export function modelFallbackChain(model: string): string[] {
  return [...new Set([model, DEFAULT_MODEL, LEGACY_FALLBACK])];
}

export function modelPricing(model: string): ChatModel["pricing"] {
  return (
    CHAT_MODELS.find((m) => m.id === model)?.pricing ??
    RETIRED_PRICING[model] ??
    CHAT_MODELS.find((m) => m.id === DEFAULT_MODEL)!.pricing
  );
}

export function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o\d)/.test(model);
}

/** All chat models we offer accept image input. */
export function supportsVision(model: string): boolean {
  return CHAT_MODELS.some((m) => m.id === model);
}

/**
 * Lowest reasoning effort each family accepts. Support replies need to be
 * quick, and with reasoning off the completion budget isn't eaten by hidden
 * reasoning tokens. The original GPT-5 models bottom out at "minimal"; GPT-5.1
 * and later accept "none".
 */
function lowestReasoningEffort(model: string): string | undefined {
  if (/^gpt-5(-mini|-nano)?(-\d{4}-\d{2}-\d{2})?$/.test(model)) return "minimal";
  if (/^gpt-5\.\d/.test(model)) return "none";
  return undefined;
}

/**
 * GPT-5.1+ with reasoning off accepts `temperature`; it matters here because
 * orgs default to 0 to stop invented prices and phone numbers. `omit` lists
 * parameters a model has refused, which are left out of the request.
 */
export function chatRequestBody(params: {
  model: string;
  temperature?: number;
  max_tokens?: number;
  messages: unknown[];
  omit?: ReadonlySet<string>;
}): Record<string, unknown> {
  const effort = lowestReasoningEffort(params.model);
  const body: Record<string, unknown> = isReasoningModel(params.model)
    ? {
        model: params.model,
        reasoning_effort: effort,
        temperature: effort === "none" ? params.temperature : undefined,
        max_completion_tokens: params.max_tokens,
        messages: params.messages,
      }
    : {
        model: params.model,
        temperature: params.temperature,
        max_tokens: params.max_tokens,
        messages: params.messages,
      };
  for (const param of params.omit ?? []) delete body[param];
  return body;
}

// Settings we add for tuning, which a model may refuse without the request
// being wrong; never model or messages.
const OPTIONAL_PARAMS = new Set(["temperature", "reasoning_effort", "max_tokens", "max_completion_tokens"]);

export type OpenAIErrorKind =
  /** The model refused one of our tuning parameters: drop it, same model. */
  | { kind: "param"; param: string }
  /** The model itself is gone or not on this key: try the next model. */
  | { kind: "model" }
  /** Anything else (bad image URL, prompt too long, rate limit, outage). */
  | { kind: "request" };

export function classifyOpenAIError(status: number, body: string): OpenAIErrorKind {
  if (status === 404) return { kind: "model" };
  if (status !== 400) return { kind: "request" };
  let error: { code?: string; param?: string } = {};
  try {
    error = (JSON.parse(body) as { error?: typeof error }).error ?? {};
  } catch {
    return { kind: "request" };
  }
  if (error.code === "model_not_found") return { kind: "model" };
  if (
    (error.code === "unsupported_parameter" || error.code === "unsupported_value") &&
    error.param &&
    OPTIONAL_PARAMS.has(error.param)
  ) {
    return { kind: "param", param: error.param };
  }
  return { kind: "request" };
}
