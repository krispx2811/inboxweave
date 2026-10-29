"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgMember } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const DateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .or(z.literal("").transform(() => undefined));

const CreateSchema = z.object({
  orgId: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  details: z.string().trim().min(1).max(2000),
  startsOn: DateField,
  endsOn: DateField,
  // getTimezoneOffset: minutes behind UTC, so Oman (UTC+4) is -240.
  tzOffset: z.coerce.number().int().min(-840).max(840),
});

/** A local calendar day's first or last instant, as a UTC timestamp. */
function localDayBoundary(date: string, tzOffset: number, end: boolean): string {
  const [y, m, d] = date.split("-").map(Number);
  const utc = end ? Date.UTC(y!, m! - 1, d!, 23, 59, 59, 999) : Date.UTC(y!, m! - 1, d!);
  return new Date(utc + tzOffset * 60_000).toISOString();
}

async function requireOwner(orgId: string) {
  const ctx = await requireOrgMember(orgId);
  // Offers change what the AI tells every customer, like the knowledge base.
  if (ctx.role !== "owner") throw new Error("Only owners can manage offers");
  return ctx;
}

export async function createOffer(formData: FormData) {
  const parsed = CreateSchema.parse({
    orgId: formData.get("orgId"),
    title: formData.get("title"),
    details: formData.get("details"),
    startsOn: formData.get("startsOn") ?? undefined,
    endsOn: formData.get("endsOn") ?? undefined,
    tzOffset: formData.get("tzOffset") ?? 0,
  });
  if (parsed.startsOn && parsed.endsOn && parsed.startsOn > parsed.endsOn) {
    throw new Error("The offer's end date is before its start date");
  }
  const ctx = await requireOwner(parsed.orgId);
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("offers").insert({
    org_id: parsed.orgId,
    title: parsed.title,
    details: parsed.details,
    starts_at: parsed.startsOn ? localDayBoundary(parsed.startsOn, parsed.tzOffset, false) : null,
    ends_at: parsed.endsOn ? localDayBoundary(parsed.endsOn, parsed.tzOffset, true) : null,
    tz_offset_minutes: parsed.tzOffset,
    created_by: ctx.userId,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${parsed.orgId}/offers`);
}

const OfferRefSchema = z.object({
  orgId: z.string().uuid(),
  offerId: z.string().uuid(),
});

export async function setOfferActive(formData: FormData) {
  const parsed = OfferRefSchema.extend({ active: z.enum(["true", "false"]) }).parse({
    orgId: formData.get("orgId"),
    offerId: formData.get("offerId"),
    active: formData.get("active"),
  });
  await requireOwner(parsed.orgId);
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("offers")
    .update({ is_active: parsed.active === "true", updated_at: new Date().toISOString() })
    .eq("id", parsed.offerId)
    .eq("org_id", parsed.orgId);
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${parsed.orgId}/offers`);
}

export async function deleteOffer(formData: FormData) {
  const parsed = OfferRefSchema.parse({
    orgId: formData.get("orgId"),
    offerId: formData.get("offerId"),
  });
  await requireOwner(parsed.orgId);
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("offers").delete().eq("id", parsed.offerId).eq("org_id", parsed.orgId);
  if (error) throw new Error(error.message);
  revalidatePath(`/app/${parsed.orgId}/offers`);
}
