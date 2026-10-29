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
  { id: "gpt-4.1-nano", label: "GPT-4.1 Nano", pricing: { prompt: 0.1, completion: 0.4 }, retiring: true },
];

export function modelPricing(model: string): ChatModel["pricing"] {
  return (
    CHAT_MODELS.find((m) => m.id === model)?.pricing ??
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

export function chatRequestBody(params: {
  model: string;
  temperature?: number;
  max_tokens?: number;
  messages: unknown[];
}): Record<string, unknown> {
  if (!isReasoningModel(params.model)) {
    return {
      model: params.model,
      temperature: params.temperature,
      max_tokens: params.max_tokens,
      messages: params.messages,
    };
  }
  return {
    model: params.model,
    reasoning_effort: lowestReasoningEffort(params.model),
    max_completion_tokens: params.max_tokens,
    messages: params.messages,
  };
}
