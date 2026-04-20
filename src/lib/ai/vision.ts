import "server-only";
import { getOpenAIKeyForOrg, getAiSettings } from "./openai";

/**
 * Analyze an image using GPT-4o's vision capabilities.
 * Uses raw fetch (no SDK) to avoid stray OPENAI_* env vars on the host.
 */
export async function describeImage(params: {
  orgId: string;
  imageUrl: string;
  contextHint?: string;
}): Promise<string> {
  const apiKey = await getOpenAIKeyForOrg(params.orgId);
  const settings = await getAiSettings(params.orgId);
  const visionModel = settings.model.includes("4o") ? settings.model : "gpt-4o-mini";

  const content: Array<Record<string, unknown>> = [
    { type: "image_url", image_url: { url: params.imageUrl, detail: "low" } },
  ];
  if (params.contextHint) {
    content.push({ type: "text", text: `Customer's message: ${params.contextHint}` });
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
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
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`OpenAI vision ${res.status}: ${text.slice(0, 200)}`);
  const json = JSON.parse(text) as { choices: Array<{ message?: { content?: string } }> };
  return json.choices[0]?.message?.content?.trim() ?? "[Could not analyze image]";
}
