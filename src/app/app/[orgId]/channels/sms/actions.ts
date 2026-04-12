"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgMember } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { bufferToPgBytea, encryptSecret } from "@/lib/crypto/secrets";

const Schema = z.object({
  orgId: z.string().uuid(),
  accountSid: z.string().min(10),
  authToken: z.string().min(10),
  phoneNumber: z.string().regex(/^\+\d{8,15}$/u, "Must be E.164 format: +1234567890"),
});

export async function saveSmsSettings(formData: FormData) {
  const parsed = Schema.parse({
    orgId: formData.get("orgId"),
    accountSid: formData.get("accountSid"),
    authToken: formData.get("authToken"),
    phoneNumber: formData.get("phoneNumber"),
  });
  const ctx = await requireOrgMember(parsed.orgId);
  if (ctx.role !== "owner") throw new Error("Only owners can configure SMS");

  const encrypted = bufferToPgBytea(encryptSecret(parsed.authToken));
  const admin = createSupabaseAdminClient();

  await admin.from("sms_settings").upsert({
    org_id: parsed.orgId,
    twilio_account_sid: parsed.accountSid,
    twilio_auth_token_ciphertext: encrypted,
    twilio_phone_number: parsed.phoneNumber,
  });

  await admin.from("channels").upsert(
    {
      org_id: parsed.orgId,
      platform: "sms",
      external_id: parsed.phoneNumber,
      display_name: `SMS ${parsed.phoneNumber}`,
      access_token_ciphertext: encrypted,
      status: "active",
    },
    { onConflict: "external_id" },
  );

  revalidatePath(`/app/${parsed.orgId}/channels/sms`);
  revalidatePath(`/app/${parsed.orgId}/channels`);
}
