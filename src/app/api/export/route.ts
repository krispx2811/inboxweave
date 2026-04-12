import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * CSV export endpoint.
 * GET /api/export?orgId=...&type=conversations|messages|contacts
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("unauthorized", { status: 401 });

  const orgId = req.nextUrl.searchParams.get("orgId");
  const type = req.nextUrl.searchParams.get("type");
  if (!orgId || !type) return new NextResponse("missing params", { status: 400 });

  const admin = createSupabaseAdminClient();

  // Verify membership.
  const { data: member } = await admin
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) return new NextResponse("forbidden", { status: 403 });

  let csv = "";

  if (type === "conversations") {
    const { data } = await admin
      .from("conversations")
      .select("id, contact_name, contact_external_id, ai_enabled, status, tags, language, sentiment, last_message_at, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(5000);
    csv = "id,contact_name,contact_id,ai_enabled,status,tags,language,sentiment,last_message,created\n";
    for (const r of data ?? []) {
      csv += `${r.id},"${r.contact_name ?? ""}",${r.contact_external_id},${r.ai_enabled},${r.status},"${(r.tags as string[])?.join(";") ?? ""}",${r.language ?? ""},${r.sentiment ?? ""},${r.last_message_at},${r.created_at}\n`;
    }
  } else if (type === "messages") {
    const { data } = await admin
      .from("messages")
      .select("id, conversation_id, direction, sender, content, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(10000);
    csv = "id,conversation_id,direction,sender,content,created_at\n";
    for (const r of data ?? []) {
      const safe = (r.content as string).replace(/"/g, '""').replace(/\n/g, " ");
      csv += `${r.id},${r.conversation_id},${r.direction},${r.sender},"${safe}",${r.created_at}\n`;
    }
  } else if (type === "contacts") {
    const { data } = await admin
      .from("conversations")
      .select("contact_name, contact_external_id, language, sentiment, tags, last_message_at, channels(platform)")
      .eq("org_id", orgId)
      .order("last_message_at", { ascending: false })
      .limit(5000);
    csv = "name,external_id,platform,language,sentiment,tags,last_message\n";
    for (const r of data ?? []) {
      const ch = (r as unknown as { channels?: { platform: string } }).channels;
      csv += `"${r.contact_name ?? ""}",${r.contact_external_id},${ch?.platform ?? ""},${r.language ?? ""},${r.sentiment ?? ""},"${(r.tags as string[])?.join(";") ?? ""}",${r.last_message_at}\n`;
    }
  } else {
    return new NextResponse("invalid type", { status: 400 });
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${type}-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
