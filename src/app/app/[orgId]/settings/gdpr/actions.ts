"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgMember } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const Schema = z.object({
  orgId: z.string().uuid(),
  contactId: z.string().min(1),
});

export async function requestGdprExport(formData: FormData) {
  const parsed = Schema.parse({ orgId: formData.get("orgId"), contactId: formData.get("contactId") });
  const ctx = await requireOrgMember(parsed.orgId);
  if (ctx.role !== "owner") throw new Error("Only owners can request GDPR exports");

  const admin = createSupabaseAdminClient();

  // Generate CSV of all messages for this contact.
  const { data: messages } = await admin
    .from("messages")
    .select("id, direction, sender, content, created_at, conversation_id")
    .eq("org_id", parsed.orgId)
    .in("conversation_id",
      admin.from("conversations").select("id").eq("org_id", parsed.orgId).eq("contact_external_id", parsed.contactId) as never
    )
    .order("created_at");

  let csv = "id,direction,sender,content,created_at\n";
  for (const m of messages ?? []) {
    const safe = (m.content as string).replace(/"/g, '""').replace(/\n/g, " ");
    csv += `${m.id},${m.direction},${m.sender},"${safe}",${m.created_at}\n`;
  }

  // Store as a Supabase Storage file.
  const fileName = `gdpr/${parsed.orgId}/${parsed.contactId}-${Date.now()}.csv`;
  await admin.storage.from("knowledge").upload(fileName, csv, { contentType: "text/csv" });

  await admin.from("gdpr_requests").insert({
    org_id: parsed.orgId,
    contact_external_id: parsed.contactId,
    request_type: "export",
    status: "completed",
    requested_by: ctx.userId,
    completed_at: new Date().toISOString(),
    result_url: fileName,
  });

  revalidatePath(`/app/${parsed.orgId}/settings/gdpr`);
}

export async function requestGdprDelete(formData: FormData) {
  const parsed = Schema.parse({ orgId: formData.get("orgId"), contactId: formData.get("contactId") });
  const ctx = await requireOrgMember(parsed.orgId);
  if (ctx.role !== "owner") throw new Error("Only owners can delete contact data");

  const admin = createSupabaseAdminClient();

  // Find all conversations for this contact.
  const { data: convos } = await admin
    .from("conversations")
    .select("id")
    .eq("org_id", parsed.orgId)
    .eq("contact_external_id", parsed.contactId);

  const convoIds = (convos ?? []).map((c) => c.id as string);

  if (convoIds.length > 0) {
    // Delete messages, notes, ratings, suggested replies.
    await admin.from("messages").delete().in("conversation_id", convoIds);
    await admin.from("internal_notes").delete().in("conversation_id", convoIds);
    await admin.from("csat_ratings").delete().in("conversation_id", convoIds);
    await admin.from("suggested_replies").delete().in("conversation_id", convoIds);
    await admin.from("scheduled_messages").delete().in("conversation_id", convoIds);
    // Delete conversations themselves.
    await admin.from("conversations").delete().in("id", convoIds);
  }

  // Delete contacts table entries.
  await admin.from("contacts").delete().eq("org_id", parsed.orgId).eq("external_id", parsed.contactId);

  await admin.from("gdpr_requests").insert({
    org_id: parsed.orgId,
    contact_external_id: parsed.contactId,
    request_type: "delete",
    status: "completed",
    requested_by: ctx.userId,
    completed_at: new Date().toISOString(),
  });

  await admin.from("audit_logs").insert({
    org_id: parsed.orgId,
    user_id: ctx.userId,
    action: "gdpr_delete",
    payload: { contact_external_id: parsed.contactId, conversations_deleted: convoIds.length },
  });

  revalidatePath(`/app/${parsed.orgId}/settings/gdpr`);
}
