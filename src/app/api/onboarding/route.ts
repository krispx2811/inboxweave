import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * POST /api/onboarding — create an org + make the user its owner.
 * Called right after signup.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { orgName?: string; userId?: string };
  if (!body.orgName || !body.userId) {
    return NextResponse.json({ error: "Missing orgName or userId" }, { status: 400 });
  }

  const slug = body.orgName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  const admin = createSupabaseAdminClient();

  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({ name: body.orgName, slug: slug || `org-${Date.now()}` })
    .select("id")
    .single();
  if (orgErr) return NextResponse.json({ error: orgErr.message }, { status: 500 });

  await admin.from("org_members").insert({
    org_id: org.id,
    user_id: body.userId,
    role: "owner",
  });

  await admin.from("ai_settings").insert({ org_id: org.id });

  return NextResponse.json({ orgId: org.id });
}
