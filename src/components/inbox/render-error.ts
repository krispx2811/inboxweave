import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Log an inbox render failure to audit_logs (so it can be diagnosed without
 * host function logs) and return the error to rethrow for inbox/error.tsx.
 * The list and the chat pane stream separately, so each one calls this.
 */
export async function inboxRenderError(orgId: string, err: unknown): Promise<Error> {
  const message = (err as Error)?.message ?? String(err);
  const stack = ((err as Error)?.stack ?? "").slice(0, 1000);
  try {
    const admin = createSupabaseAdminClient();
    await admin.from("audit_logs").insert({
      org_id: orgId,
      action: "inbox_render_error",
      payload: { message, stack, ts: new Date().toISOString() },
    });
  } catch {}
  return new Error(`[inbox] ${message}`);
}
