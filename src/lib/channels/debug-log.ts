import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Log an incoming webhook request so it's visible in the database for
 * debugging, regardless of whether the signature passed. Non-blocking.
 */
export function logWebhookDebug(params: {
  platform: "whatsapp" | "instagram" | "messenger";
  method: string;
  statusCode: number;
  signatureOk?: boolean;
  parsedCount?: number;
  rawBody?: string;
  queryString?: string;
  orgId?: string | null;
  error?: string;
}): void {
  const admin = createSupabaseAdminClient();
  void admin
    .from("webhook_debug")
    .insert({
      platform: params.platform,
      method: params.method,
      status_code: params.statusCode,
      signature_ok: params.signatureOk ?? null,
      parsed_count: params.parsedCount ?? null,
      org_id: params.orgId ?? null,
      raw_body: params.rawBody?.slice(0, 5000) ?? null,
      query_string: params.queryString?.slice(0, 2000) ?? null,
      error: params.error ?? null,
    })
    .then(() => {});
}
