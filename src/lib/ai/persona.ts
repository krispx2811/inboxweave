import { z } from "zod";
import { DEFAULT_MODEL } from "./models.ts";

/**
 * The AI persona form on the Settings page. Pure, so it can be unit-tested.
 * The persona is sent with every AI reply, so it has a cap, but a generous one.
 */
export const PERSONA_MAX_CHARS = 20_000;

const PersonaSchema = z.object({
  system_prompt: z.string().min(1).max(PERSONA_MAX_CHARS),
  model: z.string().min(1).max(50),
  temperature: z.coerce.number().min(0).max(2),
});

export type PersonaForm = z.infer<typeof PersonaSchema>;

const formatCount = (n: number) => n.toLocaleString("en-US");

/** Check the persona form. On failure, return a message the owner can act on instead of throwing. */
export function parsePersonaForm(input: {
  system_prompt: unknown;
  model: unknown;
  temperature: unknown;
}): { ok: true; data: PersonaForm } | { ok: false; error: string } {
  const prompt = typeof input.system_prompt === "string" ? input.system_prompt : "";
  if (prompt.length > PERSONA_MAX_CHARS) {
    return {
      ok: false,
      error: `Your persona is ${formatCount(prompt.length)} characters, and the limit is ${formatCount(PERSONA_MAX_CHARS)}. Shorten it, or move long details like prices and FAQs into Knowledge.`,
    };
  }

  const parsed = PersonaSchema.safeParse({
    system_prompt: prompt,
    model: input.model ?? DEFAULT_MODEL,
    temperature: input.temperature,
  });
  if (parsed.success) return { ok: true, data: parsed.data };

  const field = parsed.error.issues[0]?.path[0];
  if (field === "system_prompt") return { ok: false, error: "Write a persona before saving." };
  if (field === "temperature") return { ok: false, error: "Temperature must be a number from 0 to 2." };
  return { ok: false, error: "Pick a model and try again." };
}
