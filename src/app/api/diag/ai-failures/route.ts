import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diagnostic: returns the last 20 ai_reply_failed audit entries across the
 * caller's orgs, plus recent conversations showing ai_enabled state.
 * Auth: any signed-in user (service-role query is filtered by their memberships).
 */
export async function GET() {
  const user = await requireUser();
  const admin = createSupabaseAdminClient();

  const { data: memberships } = await admin
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id);
  const orgIds = (memberships ?? []).map((m) => m.org_id as string);
  if (orgIds.length === 0) return NextResponse.json({ orgs: [], failures: [] });

  const [{ data: failures }, { data: recent }] = await Promise.all([
    admin
      .from("audit_logs")
      .select("created_at, action, payload, org_id")
      .in("org_id", orgIds)
      .in("action", ["ai_reply_failed", "ai_auto_disabled", "ai_disabled"])
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("conversations")
      .select("id, contact_name, ai_enabled, is_escalated, last_message_at, org_id")
      .in("org_id", orgIds)
      .order("last_message_at", { ascending: false })
      .limit(10),
  ]);

  return NextResponse.json(
    { orgs: orgIds, failures: failures ?? [], recent_conversations: recent ?? [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}
