"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgMember } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const ToggleSchema = z.object({
  orgId: z.string().uuid(),
  enabled: z.coerce.boolean(),
});

/**
 * Flip the org-wide AI master switch (the dashboard kill switch). When off, the
 * AI stops auto-replying across every conversation and channel; inbound messages
 * still arrive in the inbox for a human. Independent of the per-conversation
 * Pause AI button. Any org member may toggle it.
 */
export async function setOrgAiEnabled(formData: FormData) {
  const parsed = ToggleSchema.parse({
    orgId: formData.get("orgId"),
    enabled: formData.get("enabled"),
  });
  const ctx = await requireOrgMember(parsed.orgId);

  const admin = createSupabaseAdminClient();
  // Upsert so the toggle works even before an ai_settings row exists. The DB
  // default for ai_enabled is true, so the column defaults to on for new orgs.
  const { error } = await admin.from("ai_settings").upsert({
    org_id: parsed.orgId,
    ai_enabled: parsed.enabled,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);

  await admin.from("audit_logs").insert({
    org_id: parsed.orgId,
    user_id: ctx.userId,
    action: parsed.enabled ? "org_ai_enabled" : "org_ai_disabled",
    payload: { scope: "org_master" },
  });

  revalidatePath(`/app/${parsed.orgId}/dashboard`);
}
