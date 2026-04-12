"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { requireOrgMember } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const AddSchema = z.object({
  orgId: z.string().uuid(),
  url: z.string().url(),
  events: z.string(),
});

export async function addWebhook(formData: FormData) {
  const parsed = AddSchema.parse({
    orgId: formData.get("orgId"),
    url: formData.get("url"),
    events: formData.get("events"),
  });
  const ctx = await requireOrgMember(parsed.orgId);
  if (ctx.role !== "owner") throw new Error("Only owners can manage webhooks");

  const events = parsed.events.split(",").map((e) => e.trim()).filter(Boolean);
  const secret = randomBytes(32).toString("hex");
  const admin = createSupabaseAdminClient();
  await admin.from("webhook_subscriptions").insert({
    org_id: parsed.orgId,
    url: parsed.url,
    events,
    secret,
    is_active: true,
  });
  revalidatePath(`/app/${parsed.orgId}/settings/webhooks`);
}

export async function deleteWebhook(formData: FormData) {
  const orgId = formData.get("orgId") as string;
  const webhookId = formData.get("webhookId") as string;
  const ctx = await requireOrgMember(orgId);
  if (ctx.role !== "owner") throw new Error("Only owners can manage webhooks");
  const admin = createSupabaseAdminClient();
  await admin.from("webhook_subscriptions").delete().eq("id", webhookId).eq("org_id", orgId);
  revalidatePath(`/app/${orgId}/settings/webhooks`);
}
