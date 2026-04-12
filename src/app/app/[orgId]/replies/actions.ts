"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgMember } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const CreateSchema = z.object({
  orgId: z.string().uuid(),
  title: z.string().min(1).max(100),
  content: z.string().min(1).max(4000),
  shortcut: z.string().max(30).optional(),
  category: z.string().max(50).optional(),
});

export async function createCannedReply(formData: FormData) {
  const parsed = CreateSchema.parse({
    orgId: formData.get("orgId"),
    title: formData.get("title"),
    content: formData.get("content"),
    shortcut: formData.get("shortcut") || undefined,
    category: formData.get("category") || undefined,
  });
  const ctx = await requireOrgMember(parsed.orgId);
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("canned_replies").insert({
    org_id: parsed.orgId,
    title: parsed.title,
    content: parsed.content,
    shortcut: parsed.shortcut ?? null,
    category: parsed.category ?? null,
    created_by: ctx.userId,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${parsed.orgId}/replies`);
}

const DeleteSchema = z.object({
  orgId: z.string().uuid(),
  replyId: z.string().uuid(),
});

export async function deleteCannedReply(formData: FormData) {
  const parsed = DeleteSchema.parse({
    orgId: formData.get("orgId"),
    replyId: formData.get("replyId"),
  });
  await requireOrgMember(parsed.orgId);
  const admin = createSupabaseAdminClient();
  await admin.from("canned_replies").delete().eq("id", parsed.replyId).eq("org_id", parsed.orgId);
  revalidatePath(`/app/${parsed.orgId}/replies`);
}
