/**
 * Instagram Business Login scopes and the webhook fields they unlock. Pure.
 */

export const IG_BASE_SCOPES = ["instagram_business_basic", "instagram_business_manage_messages"] as const;
export const IG_COMMENTS_SCOPE = "instagram_business_manage_comments";

/** The scopes we ask for. Comment access only when Comment to DM needs it. */
export function requestedIgScopes(withComments: boolean): string[] {
  return withComments ? [...IG_BASE_SCOPES, IG_COMMENTS_SCOPE] : [...IG_BASE_SCOPES];
}

/** Meta's `permissions` from the token exchange: an array or a comma-separated string. */
export function parseGrantedScopes(raw: unknown): string[] | null {
  const list = Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? raw.split(",") : [];
  const scopes = [...new Set(list.map((s) => s.trim()).filter(Boolean))];
  return scopes.length > 0 ? scopes : null;
}

export function hasCommentAccess(scopes: readonly string[] | null | undefined): boolean {
  return !!scopes && scopes.includes(IG_COMMENTS_SCOPE);
}

/** Webhook fields to subscribe an account to. Comment fields need comment access. */
export function igSubscribedFields(scopes: readonly string[] | null | undefined): string {
  return hasCommentAccess(scopes) ? "messages,comments,messaging_postbacks" : "messages";
}

/**
 * The scopes to save after the webhook subscription. Comment access only counts
 * when the comment fields were actually subscribed.
 */
export function scopesAfterSubscribe(
  permitted: string[] | null,
  commentFieldsSubscribed: boolean,
): string[] | null {
  if (!permitted || commentFieldsSubscribed || !hasCommentAccess(permitted)) return permitted;
  return permitted.filter((s) => s !== IG_COMMENTS_SCOPE);
}

export function buildIgLoginUrl(params: {
  appId: string;
  appUrl: string;
  state: string;
  withComments?: boolean;
}): string {
  return (
    "https://www.instagram.com/oauth/authorize?" +
    new URLSearchParams({
      enable_fb_login: "0",
      force_authentication: "1",
      client_id: params.appId,
      redirect_uri: `${params.appUrl}/api/meta/oauth/callback`,
      response_type: "code",
      scope: requestedIgScopes(params.withComments ?? false).join(","),
      state: params.state,
    }).toString()
  );
}

/** The Instagram app id for an org: its own IG app, its legacy app, or the platform's. */
export function pickIgAppId(
  row: { ig_app_id?: unknown; app_id?: unknown } | null | undefined,
  fallback: string | undefined,
): string | undefined {
  const own = (row?.ig_app_id as string | null | undefined) ?? (row?.app_id as string | null | undefined);
  return own ?? fallback;
}
