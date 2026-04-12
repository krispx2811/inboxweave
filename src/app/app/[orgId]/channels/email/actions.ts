"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgMember } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { bufferToPgBytea, encryptSecret } from "@/lib/crypto/secrets";

const Schema = z.object({
  orgId: z.string().uuid(),
  emailAddress: z.string().email(),
  imapHost: z.string().min(1),
  imapPort: z.coerce.number().min(1).max(65535),
  smtpHost: z.string().min(1),
  smtpPort: z.coerce.number().min(1).max(65535),
  password: z.string().min(1),
});

export async function saveEmailSettings(formData: FormData) {
  const parsed = Schema.parse({
    orgId: formData.get("orgId"),
    emailAddress: formData.get("emailAddress"),
    imapHost: formData.get("imapHost"),
    imapPort: formData.get("imapPort"),
    smtpHost: formData.get("smtpHost"),
    smtpPort: formData.get("smtpPort"),
    password: formData.get("password"),
  });
  const ctx = await requireOrgMember(parsed.orgId);
  if (ctx.role !== "owner") throw new Error("Only owners can configure email");

  const creds = `${parsed.emailAddress}:${parsed.password}`;
  const encrypted = bufferToPgBytea(encryptSecret(creds));
  const admin = createSupabaseAdminClient();
  await admin.from("email_settings").upsert({
    org_id: parsed.orgId,
    email_address: parsed.emailAddress,
    imap_host: parsed.imapHost,
    imap_port: parsed.imapPort,
    smtp_host: parsed.smtpHost,
    smtp_port: parsed.smtpPort,
    credentials_ciphertext: encrypted,
  });

  // Also create a channel entry for the email.
  await admin.from("channels").upsert(
    {
      org_id: parsed.orgId,
      platform: "email",
      external_id: parsed.emailAddress,
      display_name: parsed.emailAddress,
      access_token_ciphertext: encrypted,
      status: "active",
    },
    { onConflict: "external_id" },
  );

  revalidatePath(`/app/${parsed.orgId}/channels/email`);
  revalidatePath(`/app/${parsed.orgId}/channels`);
}
