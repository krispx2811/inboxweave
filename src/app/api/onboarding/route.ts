import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/guards";

export const runtime = "nodejs";

const NEW_ACCOUNT_WINDOW_MS = 15 * 60_000;

/**
 * POST /api/onboarding — create an org + make the user its owner.
 * Called right after signup. The owner is the signed-in session user. When
 * email confirmation is on there's no session yet, so a body userId is
 * accepted only for a brand-new account that belongs to no org — never to
 * make an existing user the owner of someone else's org.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { orgName?: string; userId?: string };
  if (!body.orgName) {
    return NextResponse.json({ error: "Missing orgName" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  let userId = (await getSessionUser())?.id;
  if (!userId && body.userId) {
    const { data } = await admin.auth.admin.getUserById(body.userId);
    const created = data?.user?.created_at ? new Date(data.user.created_at).getTime() : 0;
    const { count } = await admin
      .from("org_members")
      .select("org_id", { count: "exact", head: true })
      .eq("user_id", body.userId);
    if (data?.user && Date.now() - created < NEW_ACCOUNT_WINDOW_MS && count === 0) {
      userId = data.user.id;
    }
  }
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const slug = body.orgName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({ name: body.orgName, slug: slug || `org-${Date.now()}` })
    .select("id")
    .single();
  if (orgErr) return NextResponse.json({ error: orgErr.message }, { status: 500 });

  await admin.from("org_members").insert({
    org_id: org.id,
    user_id: userId,
    role: "owner",
  });

  await admin.from("ai_settings").insert({ org_id: org.id });

  return NextResponse.json({ orgId: org.id });
}
