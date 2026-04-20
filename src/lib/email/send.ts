import "server-only";

/**
 * Minimal email sender using Resend's REST API. No SDK, no dependency.
 * Gracefully no-ops (returns {skipped:true}) when RESEND_API_KEY is unset,
 * so local dev and unconfigured deploys don't crash.
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  from?: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string; id?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, skipped: true };

  const from = params.from ?? process.env.EMAIL_FROM ?? "InboxWeave <alerts@inboxweave.com>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: params.to,
        subject: params.subject,
        html: params.html,
      }),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `resend ${res.status}: ${text.slice(0, 200)}` };
    const json = JSON.parse(text) as { id?: string };
    return { ok: true, id: json.id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
