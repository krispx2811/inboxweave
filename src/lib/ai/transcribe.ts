import "server-only";
import { getOpenAIKeyForOrg } from "./openai";
import { isMetaMediaUrl } from "@/lib/net/safe-url";

/**
 * Transcribe an audio file via OpenAI Whisper using direct multipart fetch
 * (bypasses the OpenAI SDK and its env-var inheritance).
 */
export async function transcribeAudio(params: {
  orgId: string;
  audioUrl: string;
  languageHint?: string;
}): Promise<string> {
  const apiKey = await getOpenAIKeyForOrg(params.orgId);

  // audioUrl comes from the inbound webhook payload: only fetch Meta CDN URLs.
  if (!isMetaMediaUrl(params.audioUrl)) throw new Error("Refusing to fetch audio from untrusted URL");

  const audioRes = await fetch(params.audioUrl, {
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  if (!audioRes.ok) throw new Error(`Failed to fetch audio: ${audioRes.statusText}`);
  const blob = await audioRes.blob();

  const form = new FormData();
  form.append("file", new File([blob], "audio.ogg", { type: blob.type || "audio/ogg" }));
  form.append("model", "whisper-1");
  if (params.languageHint) form.append("language", params.languageHint.slice(0, 2));

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Whisper ${res.status}: ${text.slice(0, 200)}`);
  const json = JSON.parse(text) as { text: string };
  return json.text;
}
