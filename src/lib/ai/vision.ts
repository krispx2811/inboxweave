import "server-only";
import { getOpenAIForOrg, getAiSettings } from "./openai";

/**
 * Analyze an image using GPT-4o's vision capabilities.
 * Returns a text description the AI can use to respond.
 */
export async function describeImage(params: {
  orgId: string;
  imageUrl: string;
  contextHint?: string;
}): Promise<string> {
  const client = await getOpenAIForOrg(params.orgId);
  const settings = await getAiSettings(params.orgId);

  // Vision requires a model that supports it.
  const visionModel = settings.model.includes("4o") ? settings.model : "gpt-4o-mini";

  const res = await client.chat.completions.create({
    model: visionModel,
    max_tokens: 300,
    messages: [
      {
        role: "system",
        content:
          "You are a customer support assistant. A customer sent an image. Describe what you see concisely. If it appears to be a screenshot of an error, product issue, or receipt, extract the relevant details.",
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: params.imageUrl, detail: "low" },
          },
          ...(params.contextHint
            ? [{ type: "text" as const, text: `Customer's message: ${params.contextHint}` }]
            : []),
        ],
      },
    ],
  });

  return res.choices[0]?.message?.content?.trim() ?? "[Could not analyze image]";
}
