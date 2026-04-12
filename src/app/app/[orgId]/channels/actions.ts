"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgMember } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { bufferToPgBytea, encryptSecret } from "@/lib/crypto/secrets";

const WhatsAppSchema = z.object({
  orgId: z.string().uuid(),
  phoneNumberId: z.string().min(3),
  displayName: z.string().min(1).max(80),
  accessToken: z.string().min(20),
});

export async function connectWhatsApp(formData: FormData) {
  const parsed = WhatsAppSchema.parse({
    orgId: formData.get("orgId"),
    phoneNumberId: formData.get("phoneNumberId"),
    displayName: formData.get("displayName"),
    accessToken: formData.get("accessToken"),
  });
  const ctx = await requireOrgMember(parsed.orgId);
  if (ctx.role !== "owner") throw new Error("Only owners can connect channels");

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("channels").upsert(
    {
      org_id: parsed.orgId,
      platform: "whatsapp",
      external_id: parsed.phoneNumberId,
      display_name: parsed.displayName,
      access_token_ciphertext: bufferToPgBytea(encryptSecret(parsed.accessToken)),
      status: "active",
    },
    { onConflict: "external_id" },
  );
  if (error) throw new Error(error.message);

  await admin.from("audit_logs").insert({
    org_id: parsed.orgId,
    user_id: ctx.userId,
    action: "channel_connected",
    payload: { platform: "whatsapp", external_id: parsed.phoneNumberId },
  });
  revalidatePath(`/app/${parsed.orgId}/channels`);
}

const DisconnectSchema = z.object({
  orgId: z.string().uuid(),
  channelId: z.string().uuid(),
});

export async function disconnectChannel(formData: FormData) {
  const parsed = DisconnectSchema.parse({
    orgId: formData.get("orgId"),
    channelId: formData.get("channelId"),
  });
  const ctx = await requireOrgMember(parsed.orgId);
  if (ctx.role !== "owner") throw new Error("Only owners can disconnect channels");
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("channels")
    .delete()
    .eq("id", parsed.channelId)
    .eq("org_id", parsed.orgId);
  if (error) throw new Error(error.message);

  await admin.from("audit_logs").insert({
    org_id: parsed.orgId,
    user_id: ctx.userId,
    action: "channel_disconnected",
    payload: { channel_id: parsed.channelId },
  });
  revalidatePath(`/app/${parsed.orgId}/channels`);
}
