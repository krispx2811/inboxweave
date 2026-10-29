/**
 * Make user input safe to interpolate into a PostgREST `.or()` / `ilike`
 * filter string. `,` `(` `)` `"` separate, group or quote filter clauses, and
 * PostgREST rewrites `*` to `%` without honouring escapes, so those are
 * dropped; `%` `_` are LIKE wildcards and `\` is the LIKE escape, so those
 * are backslash-escaped to match literally.
 */
export function escapePostgrestSearch(input: string): string {
  return input
    .slice(0, 200)
    .replace(/[,()"*]/g, "")
    .replace(/[\\%_]/g, (c) => `\\${c}`)
    .trim();
}
