import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface SessionUser {
  id: string;
  email?: string;
}

// getClaims() verifies the session JWT's signature locally against the
// project's cached public keys (asymmetric signing keys), so a page no longer
// pays a round trip to Supabase Auth on every view. Memoised per request: the
// org layout and its page both guard.
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : undefined };
});

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

export const requireOrgMember = cache(async (orgId: string): Promise<OrgContext> => {
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
});
