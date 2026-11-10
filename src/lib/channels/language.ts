/**
 * Arabic-script detection. Pure (no "server-only") so pure modules and unit
 * tests can share it; commands.ts re-exports it for existing callers.
 */
export function containsArabic(text: string | null | undefined): boolean {
  if (!text) return false;
  return /[؀-ۿ]/.test(text);
}
