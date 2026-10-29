/**
 * Inbox state lives in the URL (?c, q, status, tag, n, m) so every view is a
 * shareable link and the back button works. These helpers read and write it.
 *
 * Pure and dependency-free so it can be unit-tested without a server context.
 */

export const LIST_STEP = 40;
export const LIST_MAX = 400;
export const THREAD_STEP = 60;
export const THREAD_MAX = 600;

export const STATUS_FILTERS = ["open", "resolved", "archived"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export interface InboxState {
  /** Selected conversation id. */
  c?: string;
  q?: string;
  status?: StatusFilter;
  tag?: string;
  /** How many conversations the list shows. */
  n: number;
  /** How many messages the thread shows. */
  m: number;
}

export interface RawSearch {
  c?: string | string[];
  q?: string | string[];
  status?: string | string[];
  tag?: string | string[];
  n?: string | string[];
  m?: string | string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function first(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() ? s.trim() : undefined;
}

/** A page size from the URL: at least one step, rounded up to a whole step, capped. */
export function clampCount(raw: string | undefined, step: number, max: number): number {
  const v = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(v) || v <= step) return step;
  return Math.min(max, Math.ceil(v / step) * step);
}

export function parseInboxState(search: RawSearch): InboxState {
  const c = first(search.c);
  const status = first(search.status);
  return {
    c: c && UUID.test(c) ? c : undefined,
    q: first(search.q)?.slice(0, 100),
    status: (STATUS_FILTERS as readonly string[]).includes(status ?? "") ? (status as StatusFilter) : undefined,
    tag: first(search.tag)?.slice(0, 30),
    n: clampCount(first(search.n), LIST_STEP, LIST_MAX),
    m: clampCount(first(search.m), THREAD_STEP, THREAD_MAX),
  };
}

/**
 * Link to the inbox with `patch` applied to the current state. Defaults are
 * left out of the URL; `null` removes a key. Opening another conversation
 * should reset `m`, so pass `m: null` with a new `c`.
 */
export function inboxHref(
  orgId: string,
  state: Partial<InboxState>,
  patch: { [K in keyof InboxState]?: InboxState[K] | null } = {},
): string {
  const merged: Partial<InboxState> = { ...state };
  for (const [k, v] of Object.entries(patch) as Array<[keyof InboxState, unknown]>) {
    if (v === null) delete merged[k];
    else (merged as Record<string, unknown>)[k] = v;
  }
  const params = new URLSearchParams();
  if (merged.c) params.set("c", merged.c);
  if (merged.q) params.set("q", merged.q);
  if (merged.status) params.set("status", merged.status);
  if (merged.tag) params.set("tag", merged.tag);
  if (merged.n && merged.n > LIST_STEP) params.set("n", String(merged.n));
  if (merged.c && merged.m && merged.m > THREAD_STEP) params.set("m", String(merged.m));
  const qs = params.toString();
  return `/app/${orgId}/inbox${qs ? `?${qs}` : ""}`;
}
