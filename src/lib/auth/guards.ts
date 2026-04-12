import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function getSessionUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePlatformAdmin() {
  const user = await requireUser();
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data) redirect("/");
  return user;
}

export interface OrgContext {
  userId: string;
  orgId: string;
  role: "owner" | "agent";
}

export async function requireOrgMember(orgId: string): Promise<OrgContext> {
  const user = await requireUser();
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) redirect("/");
  return { userId: user.id, orgId, role: data.role as "owner" | "agent" };
}
