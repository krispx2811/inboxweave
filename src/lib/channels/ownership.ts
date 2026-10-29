import "server-only";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export interface ChannelOwnershipInput {
  platform: string;
  externalId: string;
  orgId: string;
}

/**
 * `channels.external_id` is globally unique and channel writes upsert on it
 * with the admin client, so without this check one org could overwrite
 * another org's channel row (and receive its inbound messages). Call before
 * any upsert keyed on external_id; throws if the row belongs to another org.
 */
export async function assertChannelNotOwnedElsewhere(
  admin: AdminClient,
  { platform, externalId, orgId }: ChannelOwnershipInput,
): Promise<void> {
  // Uniqueness is on external_id alone (not per platform), so look it up the
  // same way: a clash on any platform would still be overwritten by the upsert.
  const { data, error } = await admin
    .from("channels")
    .select("org_id")
    .eq("external_id", externalId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data && data.org_id !== orgId) {
    const what = platform === "email" ? "address" : platform === "sms" || platform === "whatsapp" ? "number" : "account";
    throw new Error(`This ${what} is already connected to another organization`);
  }
}
