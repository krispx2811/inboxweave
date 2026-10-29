import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { LiveOffer } from "./offer-format";

/** Offers switched on whose start has passed and whose end hasn't. */
export async function getLiveOffers(orgId: string): Promise<LiveOffer[]> {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("offers")
    .select("title, details, ends_at, tz_offset_minutes")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .order("created_at", { ascending: true })
    .limit(20);
  // Offers are an addition to the reply, never a reason to drop it: a missing
  // table (migration 0019 not applied) or a read error just means "none".
  if (error) {
    console.error(`[offers] read failed for ${orgId}: ${error.message}`);
    return [];
  }
  return (data ?? []) as LiveOffer[];
}
