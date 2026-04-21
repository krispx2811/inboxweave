"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgMember } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendOutbound } from "@/lib/channels/router";
import { detectStopStart } from "@/lib/channels/commands";

const ToggleSchema = z.object({
  orgId: z.string().uuid(),
  conversationId: z.string().uuid(),
  enabled: z.coerce.boolean(),
});

export async function setAiEnabled(formData: FormData) {
  const parsed = ToggleSchema.parse({
    orgId: formData.get("orgId"),
    conversationId: formData.get("conversationId"),
    enabled: formData.get("enabled"),
  });
  const ctx = await requireOrgMember(parsed.orgId);
  const admin = createSupabaseAdminClient();
  await admin
    .from("conversations")
    .update({ ai_enabled: parsed.enabled })
    .eq("id", parsed.conversationId)
    .eq("org_id", parsed.orgId);

  await admin.from("audit_logs").insert({
    org_id: parsed.orgId,
    user_id: ctx.userId,
    action: parsed.enabled ? "ai_enabled" : "ai_disabled",
    payload: { conversation_id: parsed.conversationId },
  });
  revalidatePath(`/app/${parsed.orgId}/inbox`);
}

const ReplySchema = z.object({
  orgId: z.string().uuid(),
  conversationId: z.string().uuid(),
  text: z.string().min(1).max(4000),
});

export async function sendManualReply(formData: FormData) {
  const parsed = ReplySchema.parse({
    orgId: formData.get("orgId"),
    conversationId: formData.get("conversationId"),
    text: formData.get("text"),
  });
  const ctx = await requireOrgMember(parsed.orgId);
  const admin = createSupabaseAdminClient();
  const { data: convo } = await admin
    .from("conversations")
    .select("id, org_id")
    .eq("id", parsed.conversationId)
    .single();
  if (!convo || convo.org_id !== parsed.orgId) throw new Error("Conversation not found");

  // Agent-side stop/start commands: typing just "stop" / "start" (or the
  // Arabic equivalents like إيقاف / ابدأ) in the composer toggles AI auto-
  // reply for this conversation. Mirrors the customer-side opt-out so the
  // owner can take over a chat without the AI interfering. The word itself
  // is NOT sent to the customer — it's treated as a control command.
  const command = detectStopStart(parsed.text);
  if (command) {
    const enabled = command === "start";
    await admin
      .from("conversations")
      .update({ ai_enabled: enabled })
      .eq("id", parsed.conversationId)
      .eq("org_id", parsed.orgId);
    await admin.from("audit_logs").insert({
      org_id: parsed.orgId,
      user_id: ctx.userId,
      action: enabled ? "ai_enabled" : "ai_disabled",
      payload: { conversation_id: parsed.conversationId, reason: "agent_typed_command" },
    });
    revalidatePath(`/app/${parsed.orgId}/inbox`);
    return;
  }

  const { platformMessageId } = await sendOutbound({
    conversationId: parsed.conversationId,
    text: parsed.text,
  });

  await admin.from("messages").insert({
    org_id: parsed.orgId,
    conversation_id: parsed.conversationId,
    direction: "out",
    sender: "human",
    author_user_id: ctx.userId,
    content: parsed.text,
    platform_message_id: platformMessageId ?? null,
  });

  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", parsed.conversationId);

  revalidatePath(`/app/${parsed.orgId}/inbox`);
}

// ─── Tags ────────────────────────────────────────────────────────────────────

const TagSchema = z.object({
  orgId: z.string().uuid(),
  conversationId: z.string().uuid(),
  tag: z.string().min(1).max(30),
});

export async function addTag(formData: FormData) {
  const parsed = TagSchema.parse({
    orgId: formData.get("orgId"),
    conversationId: formData.get("conversationId"),
    tag: formData.get("tag"),
  });
  await requireOrgMember(parsed.orgId);
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("conversations")
    .select("tags")
    .eq("id", parsed.conversationId)
    .single();
  const current = (data?.tags as string[]) ?? [];
  if (!current.includes(parsed.tag)) {
    await admin
      .from("conversations")
      .update({ tags: [...current, parsed.tag] })
      .eq("id", parsed.conversationId);
  }
  revalidatePath(`/app/${parsed.orgId}/inbox`);
}

export async function removeTag(formData: FormData) {
  const parsed = TagSchema.parse({
    orgId: formData.get("orgId"),
    conversationId: formData.get("conversationId"),
    tag: formData.get("tag"),
  });
  await requireOrgMember(parsed.orgId);
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("conversations")
    .select("tags")
    .eq("id", parsed.conversationId)
    .single();
  const current = (data?.tags as string[]) ?? [];
  await admin
    .from("conversations")
    .update({ tags: current.filter((t) => t !== parsed.tag) })
    .eq("id", parsed.conversationId);
  revalidatePath(`/app/${parsed.orgId}/inbox`);
}

// ─── Status ──────────────────────────────────────────────────────────────────

const StatusSchema = z.object({
  orgId: z.string().uuid(),
  conversationId: z.string().uuid(),
  status: z.enum(["open", "resolved", "archived"]),
});

export async function setConversationStatus(formData: FormData) {
  const parsed = StatusSchema.parse({
    orgId: formData.get("orgId"),
    conversationId: formData.get("conversationId"),
    status: formData.get("status"),
  });
  await requireOrgMember(parsed.orgId);
  const admin = createSupabaseAdminClient();
  const updates: Record<string, unknown> = { status: parsed.status };
  if (parsed.status === "resolved") updates.resolved_at = new Date().toISOString();
  if (parsed.status === "open") updates.resolved_at = null;
  await admin
    .from("conversations")
    .update(updates)
    .eq("id", parsed.conversationId)
    .eq("org_id", parsed.orgId);

  // Send CSAT prompt when resolving.
  if (parsed.status === "resolved") {
    import("@/lib/csat/send").then(({ sendCsatPrompt }) => sendCsatPrompt(parsed.conversationId)).catch(() => {});
    import("@/lib/webhooks/dispatch").then(({ dispatchWebhookEvent }) =>
      dispatchWebhookEvent({ orgId: parsed.orgId, event: "conversation.resolved", payload: { conversation_id: parsed.conversationId } })
    ).catch(() => {});

    // Auto-generate a summary so the next time this contact messages, the
    // AI has context from the resolved conversation (cross-conversation memory).
    import("@/lib/ai/analysis").then(async ({ generateSummary }) => {
      try {
        const summary = await generateSummary(parsed.orgId, parsed.conversationId);
        await admin
          .from("conversations")
          .update({ summary })
          .eq("id", parsed.conversationId)
          .eq("org_id", parsed.orgId);
      } catch {}
    }).catch(() => {});
  }
  revalidatePath(`/app/${parsed.orgId}/inbox`);
}

// ─── Assignment ──────────────────────────────────────────────────────────────

const AssignSchema = z.object({
  orgId: z.string().uuid(),
  conversationId: z.string().uuid(),
  userId: z.string().uuid().or(z.literal("")),
});

export async function assignConversation(formData: FormData) {
  const parsed = AssignSchema.parse({
    orgId: formData.get("orgId"),
    conversationId: formData.get("conversationId"),
    userId: formData.get("userId"),
  });
  await requireOrgMember(parsed.orgId);
  const admin = createSupabaseAdminClient();
  await admin
    .from("conversations")
    .update({ assigned_user_id: parsed.userId || null })
    .eq("id", parsed.conversationId)
    .eq("org_id", parsed.orgId);
  revalidatePath(`/app/${parsed.orgId}/inbox`);
}

// ─── Internal notes ──────────────────────────────────────────────────────────

const NoteSchema = z.object({
  orgId: z.string().uuid(),
  conversationId: z.string().uuid(),
  content: z.string().min(1).max(4000),
});

export async function addInternalNote(formData: FormData) {
  const parsed = NoteSchema.parse({
    orgId: formData.get("orgId"),
    conversationId: formData.get("conversationId"),
    content: formData.get("content"),
  });
  const ctx = await requireOrgMember(parsed.orgId);
  const admin = createSupabaseAdminClient();
  await admin.from("internal_notes").insert({
    org_id: parsed.orgId,
    conversation_id: parsed.conversationId,
    author_user_id: ctx.userId,
    content: parsed.content,
  });
  revalidatePath(`/app/${parsed.orgId}/inbox`);
}

// ─── Scheduled messages ──────────────────────────────────────────────────────

const ScheduleSchema = z.object({
  orgId: z.string().uuid(),
  conversationId: z.string().uuid(),
  content: z.string().min(1).max(4000),
  scheduledAt: z.string().min(1),
});

export async function scheduleMessage(formData: FormData) {
  const parsed = ScheduleSchema.parse({
    orgId: formData.get("orgId"),
    conversationId: formData.get("conversationId"),
    content: formData.get("content"),
    scheduledAt: formData.get("scheduledAt"),
  });
  const ctx = await requireOrgMember(parsed.orgId);
  const admin = createSupabaseAdminClient();
  await admin.from("scheduled_messages").insert({
    org_id: parsed.orgId,
    conversation_id: parsed.conversationId,
    content: parsed.content,
    scheduled_at: new Date(parsed.scheduledAt).toISOString(),
    created_by: ctx.userId,
  });
  revalidatePath(`/app/${parsed.orgId}/inbox`);
}

// ─── Pin / Bookmark ──────────────────────────────────────────────────────────

const PinSchema = z.object({
  orgId: z.string().uuid(),
  conversationId: z.string().uuid(),
  pinned: z.coerce.boolean(),
});

export async function togglePin(formData: FormData) {
  const parsed = PinSchema.parse({
    orgId: formData.get("orgId"),
    conversationId: formData.get("conversationId"),
    pinned: formData.get("pinned"),
  });
  await requireOrgMember(parsed.orgId);
  const admin = createSupabaseAdminClient();
  await admin
    .from("conversations")
    .update({ is_pinned: parsed.pinned })
    .eq("id", parsed.conversationId)
    .eq("org_id", parsed.orgId);
  revalidatePath(`/app/${parsed.orgId}/inbox`);
}

// ─── Mark read ───────────────────────────────────────────────────────────────

export async function markRead(formData: FormData) {
  const orgId = formData.get("orgId") as string;
  const conversationId = formData.get("conversationId") as string;
  await requireOrgMember(orgId);
  const admin = createSupabaseAdminClient();
  await admin
    .from("conversations")
    .update({ read_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("org_id", orgId);
  revalidatePath(`/app/${orgId}/inbox`);
}

// ─── Generate AI summary ────────────────────────────────────────────────────

export async function generateConversationSummary(formData: FormData) {
  const orgId = formData.get("orgId") as string;
  const conversationId = formData.get("conversationId") as string;
  await requireOrgMember(orgId);
  try {
    const { generateSummary } = await import("@/lib/ai/analysis");
    const summary = await generateSummary(orgId, conversationId);
    const admin = createSupabaseAdminClient();
    await admin
      .from("conversations")
      .update({ summary })
      .eq("id", conversationId)
      .eq("org_id", orgId);
  } catch (err) {
    const admin = createSupabaseAdminClient();
    await admin.from("audit_logs").insert({
      org_id: orgId,
      action: "summary_failed",
      payload: { conversation_id: conversationId, error: (err as Error).message },
    });
  }
  revalidatePath(`/app/${orgId}/inbox`);
}

// ─── Refresh suggested replies ──────────────────────────────────────────────

export async function refreshSuggestions(formData: FormData) {
  const orgId = formData.get("orgId") as string;
  const conversationId = formData.get("conversationId") as string;
  await requireOrgMember(orgId);
  try {
    const { generateSuggestedReplies } = await import("@/lib/ai/analysis");
    const suggestions = await generateSuggestedReplies(orgId, conversationId);
    const admin = createSupabaseAdminClient();
    // No unique constraint on conversation_id → use delete + insert rather
    // than upsert, to avoid "there is no unique or exclusion constraint"
    // errors from PostgREST.
    await admin.from("suggested_replies").delete().eq("conversation_id", conversationId);
    await admin.from("suggested_replies").insert({
      org_id: orgId,
      conversation_id: conversationId,
      suggestions: suggestions.map((text) => ({ text })),
    });
  } catch (err) {
    const admin = createSupabaseAdminClient();
    await admin.from("audit_logs").insert({
      org_id: orgId,
      action: "suggested_replies_failed",
      payload: { conversation_id: conversationId, error: (err as Error).message },
    });
  }
  revalidatePath(`/app/${orgId}/inbox`);
}

// ─── Bulk actions ────────────────────────────────────────────────────────────

export async function bulkAction(formData: FormData) {
  const orgId = formData.get("orgId") as string;
  const action = formData.get("action") as string;
  const ids = (formData.get("ids") as string).split(",").filter(Boolean);
  if (ids.length === 0) return;
  await requireOrgMember(orgId);
  const admin = createSupabaseAdminClient();

  if (action === "resolve") {
    await admin.from("conversations").update({ status: "resolved", resolved_at: new Date().toISOString() }).in("id", ids).eq("org_id", orgId);
  } else if (action === "archive") {
    await admin.from("conversations").update({ status: "archived" }).in("id", ids).eq("org_id", orgId);
  } else if (action === "reopen") {
    await admin.from("conversations").update({ status: "open", resolved_at: null }).in("id", ids).eq("org_id", orgId);
  } else if (action.startsWith("tag:")) {
    const tag = action.slice(4);
    for (const id of ids) {
      const { data } = await admin.from("conversations").select("tags").eq("id", id).single();
      const current = (data?.tags as string[]) ?? [];
      if (!current.includes(tag)) await admin.from("conversations").update({ tags: [...current, tag] }).eq("id", id);
    }
  } else if (action.startsWith("assign:")) {
    await admin.from("conversations").update({ assigned_user_id: action.slice(7) || null }).in("id", ids).eq("org_id", orgId);
  }
  revalidatePath(`/app/${orgId}/inbox`);
}
