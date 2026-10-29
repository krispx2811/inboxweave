import "server-only";

const GRAPH = "https://graph.facebook.com/v21.0";

export interface WhatsAppCheck {
  label: string;
  ok: boolean;
  detail: string;
}

export interface WhatsAppHealth {
  ok: boolean;
  checks: WhatsAppCheck[];
  /** WhatsApp Business Account the number belongs to, when found. */
  wabaId?: string;
  /** True when the only problem is a missing webhook subscription. */
  canSubscribe: boolean;
}

interface DebugToken {
  is_valid?: boolean;
  type?: string;
  expires_at?: number;
  data_access_expires_at?: number;
  scopes?: string[];
  granular_scopes?: Array<{ scope: string; target_ids?: string[] }>;
  error?: { message?: string };
}

async function graph<T>(path: string, token: string, init?: RequestInit): Promise<T & { error?: { message?: string } }> {
  const res = await fetch(`${GRAPH}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  return (await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }))) as T & {
    error?: { message?: string };
  };
}

/** What Meta says about a token: valid, permanent, which WhatsApp accounts. */
export async function inspectToken(token: string): Promise<DebugToken> {
  const res = await graph<{ data?: DebugToken }>(
    `debug_token?input_token=${encodeURIComponent(token)}`,
    token,
  );
  return res.data ?? { is_valid: false, error: res.error };
}

/** A token keeps working only if it never expires (System User tokens). */
export function tokenExpiry(t: DebugToken): { permanent: boolean; detail: string } {
  if (!t.expires_at) return { permanent: true, detail: "Never expires" };
  const when = new Date(t.expires_at * 1000).toISOString().slice(0, 10);
  return { permanent: false, detail: `Expires ${when}` };
}

/**
 * Checks everything a WhatsApp Cloud API channel needs to send and receive:
 * token valid and permanent, permissions, the number registered on the
 * Cloud API, and this app subscribed to the account's webhooks (without it
 * Meta never delivers incoming messages).
 */
export async function checkWhatsAppConnection(token: string, phoneNumberId: string): Promise<WhatsAppHealth> {
  const checks: WhatsAppCheck[] = [];
  const t = await inspectToken(token);

  if (!t.is_valid) {
    checks.push({
      label: "Access token",
      ok: false,
      detail: `Meta rejected the token: ${(t.error?.message ?? "invalid").replace(/\.+$/, "")}. Generate a new System User token and reconnect.`,
    });
    return { ok: false, checks, canSubscribe: false };
  }
  const expiry = tokenExpiry(t);
  checks.push({
    label: "Access token",
    ok: expiry.permanent,
    detail: expiry.permanent
      ? `Valid, never expires${t.type ? ` (${t.type.toLowerCase().replace("_", " ")} token)` : ""}`
      : `${expiry.detail}. Use a permanent System User token so it doesn't stop working.`,
  });

  const scopes = new Set(t.scopes ?? []);
  const missing = ["whatsapp_business_messaging", "whatsapp_business_management"].filter((s) => !scopes.has(s));
  checks.push({
    label: "Permissions",
    ok: missing.length === 0,
    detail: missing.length === 0 ? "Messaging and management granted" : `Missing: ${missing.join(", ")}`,
  });

  const num = await graph<{ display_phone_number?: string; verified_name?: string; status?: string; platform_type?: string; quality_rating?: string }>(
    `${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name,status,platform_type,quality_rating`,
    token,
  );
  const numberOk = !num.error && (num.platform_type ?? "CLOUD_API") === "CLOUD_API" && (num.status ?? "CONNECTED") === "CONNECTED";
  checks.push({
    label: "Phone number",
    ok: numberOk,
    detail: num.error
      ? `Can't read this number: ${num.error.message ?? "unknown error"}`
      : `${num.verified_name ?? ""} ${num.display_phone_number ?? ""}`.trim() +
        ` · ${num.status ?? "unknown status"}${num.quality_rating ? ` · quality ${num.quality_rating.toLowerCase()}` : ""}`,
  });

  // The token's WhatsApp accounts; find the one that owns this number.
  const wabaIds = t.granular_scopes?.find((s) => s.scope === "whatsapp_business_management")?.target_ids ?? [];
  let wabaId: string | undefined;
  for (const id of wabaIds) {
    const phones = await graph<{ data?: Array<{ id: string }> }>(`${id}/phone_numbers?fields=id`, token);
    if (phones.data?.some((p) => p.id === phoneNumberId)) {
      wabaId = id;
      break;
    }
  }
  let subscribed = false;
  if (wabaId) {
    const subs = await graph<{ data?: unknown[] }>(`${wabaId}/subscribed_apps`, token);
    subscribed = (subs.data?.length ?? 0) > 0;
  }
  checks.push({
    label: "Incoming messages (webhook)",
    ok: subscribed,
    detail: !wabaId
      ? "Couldn't find the WhatsApp Business Account for this number with this token."
      : subscribed
        ? "Your app is subscribed, so Meta delivers incoming messages"
        : "Your app isn't subscribed to this WhatsApp account, so Meta never sends incoming messages here.",
  });

  const ok = checks.every((c) => c.ok);
  const onlyWebhookMissing = !subscribed && !!wabaId && checks.slice(0, -1).every((c) => c.ok);
  return { ok, checks, wabaId, canSubscribe: onlyWebhookMissing };
}

/** Subscribe the token's app to the WhatsApp account's webhooks. */
export async function subscribeWhatsAppWebhooks(token: string, wabaId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await graph<{ success?: boolean }>(`${encodeURIComponent(wabaId)}/subscribed_apps`, token, { method: "POST" });
  return res.success ? { ok: true } : { ok: false, error: res.error?.message ?? "Meta didn't confirm the subscription" };
}
