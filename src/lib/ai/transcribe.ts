import "server-only";
import { getOpenAIForOrg } from "./openai";

/**
 * Transcribe an audio file using OpenAI's Whisper API.
 * `audioUrl` should be a publicly accessible URL or a base64 data URI.
 * Returns the transcribed text.
 */
export async function transcribeAudio(params: {
  orgId: string;
  audioUrl: string;
  languageHint?: string;
}): Promise<string> {
  const client = await getOpenAIForOrg(params.orgId);

  // Fetch the audio data.
  const audioRes = await fetch(params.audioUrl, { signal: AbortSignal.timeout(30_000) });
  if (!audioRes.ok) throw new Error(`Failed to fetch audio: ${audioRes.statusText}`);

  const blob = await audioRes.blob();
  const file = new File([blob], "audio.ogg", { type: blob.type || "audio/ogg" });

  const transcription = await client.audio.transcriptions.create({
    model: "whisper-1",
    file,
    language: params.languageHint?.slice(0, 2),
  });

  return transcription.text;
}
