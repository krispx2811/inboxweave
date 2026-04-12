"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const CreateOrgSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9][a-z0-9-]*$/u, "lowercase letters, digits, and dashes only"),
});

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export async function createOrganization(formData: FormData) {
  await requirePlatformAdmin();
  const rawSlug = (formData.get("slug") as string) || (formData.get("name") as string) || "";
  const parsed = CreateOrgSchema.parse({
    name: formData.get("name"),
    slug: slugify(rawSlug),
  });
  const admin = createSupabaseAdminClient();
  const { data: org, error } = await admin
    .from("organizations")
    .insert(parsed)
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await admin.from("ai_settings").insert({ org_id: org.id });

  revalidatePath("/admin");
}

const CreateUserSchema = z.object({
  orgId: z.string().uuid(),
  email: z.string().email(),
  password: z.string().min(8).max(72),
  role: z.enum(["owner", "agent"]),
});

export async function createUserForOrg(formData: FormData) {
  await requirePlatformAdmin();
  const parsed = CreateUserSchema.parse({
    orgId: formData.get("orgId"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  const admin = createSupabaseAdminClient();

  // Create the auth user (or look up if they already exist).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: parsed.email,
    password: parsed.password,
    email_confirm: true,
  });
  let userId = created?.user?.id;
  if (createErr && !userId) {
    // Likely the user already exists: look them up via list + filter.
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    userId = list?.users.find((u) => u.email === parsed.email)?.id;
  }
  if (!userId) throw new Error(createErr?.message ?? "Failed to create user");

  const { error: memErr } = await admin
    .from("org_members")
    .upsert({ org_id: parsed.orgId, user_id: userId, role: parsed.role });
  if (memErr) throw new Error(memErr.message);

  revalidatePath(`/admin/orgs/${parsed.orgId}`);
}

export async function promoteSelfToAdmin() {
  // One-time bootstrap: if there are NO platform admins yet, the first
  // signed-in user can claim the role. This runs before any orgs exist.
  const admin = createSupabaseAdminClient();
  const { count } = await admin
    .from("platform_admins")
    .select("user_id", { count: "exact", head: true });
  if ((count ?? 0) > 0) throw new Error("Platform already has an admin. Ask them to add you.");

  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in first");

  const { error } = await admin.from("platform_admins").insert({ user_id: user.id });
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}
