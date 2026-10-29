import "server-only";
import { DEFAULT_MODEL, supportsVision } from "./models";
import { chatCompletion, getOpenAIKeyForOrg, getAiSettings } from "./openai";

/**
 * Analyze an image with the org's chosen model (all offered models accept images).
 * Goes through chatCompletion, so a rejected model falls back like replies do.
 */
export async function describeImage(params: {
  orgId: string;
  imageUrl: string;
  contextHint?: string;
}): Promise<string> {
  const [apiKey, settings] = await Promise.all([
    getOpenAIKeyForOrg(params.orgId),
    getAiSettings(params.orgId),
  ]);
  const visionModel = supportsVision(settings.model) ? settings.model : DEFAULT_MODEL;

  const content: Array<Record<string, unknown>> = [
    { type: "image_url", image_url: { url: params.imageUrl, detail: "low" } },
  ];
  if (params.contextHint) {
    content.push({ type: "text", text: `Customer's message: ${params.contextHint}` });
  }

  const json = await chatCompletion({
    apiKey,
    model: visionModel,
    max_tokens: 300,
    messages: [
      {
        role: "system",
        content:
          "You are a customer support assistant. A customer sent an image. Describe what you see concisely. If it appears to be a screenshot of an error, product issue, or receipt, extract the relevant details.",
      },
      { role: "user", content },
    ],
  });
  return json.choices[0]?.message?.content?.trim() ?? "[Could not analyze image]";
}
