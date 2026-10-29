import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireOrgMember } from "@/lib/auth/guards";
import { localEndDate } from "@/lib/ai/offer-format";
import { TimezoneOffsetField } from "@/components/TimezoneOffsetField";
import { createOffer, deleteOffer, setOfferActive } from "./actions";
import { IconPlus, IconTag, IconTrash } from "@/components/icons";

export const dynamic = "force-dynamic";

type Offer = {
  id: string;
  title: string;
  details: string;
  starts_at: string | null;
  ends_at: string | null;
  tz_offset_minutes: number;
  is_active: boolean;
};

function status(o: Offer, now: number): { label: string; badge: string } {
  if (!o.is_active) return { label: "Paused", badge: "badge-gray" };
  if (o.ends_at && new Date(o.ends_at).getTime() < now) return { label: "Ended", badge: "badge-gray" };
  if (o.starts_at && new Date(o.starts_at).getTime() > now) return { label: "Scheduled", badge: "badge-blue" };
  return { label: "Live — AI is using it", badge: "badge-green" };
}

function localStartDate(o: Offer): string | null {
  return o.starts_at ? localEndDate({ ends_at: o.starts_at, tz_offset_minutes: o.tz_offset_minutes }) : null;
}

async function loadOffers(orgId: string) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("offers")
    .select("id, title, details, starts_at, ends_at, tz_offset_minutes, is_active")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  const now = Date.now();
  return ((data ?? []) as Offer[]).map((o) => ({ ...o, status: status(o, now) }));
}

export default async function OffersPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await requireOrgMember(orgId);
  const isOwner = ctx.role === "owner";
  const offers = await loadOffers(orgId);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="page-header">
        <h1>Offers</h1>
        <p>
          Promotions the AI quotes instead of your regular knowledge-base prices while they run.
          They switch off by themselves after the end date — no need to edit your documents.
        </p>
      </div>

      {isOwner && (
        <section className="card mb-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
              <IconPlus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold">New offer</h2>
              <p className="text-xs text-slate-500">Leave the dates empty for an offer with no limit</p>
            </div>
          </div>
          <form action={createOffer} className="space-y-4">
            <input type="hidden" name="orgId" value={orgId} />
            <TimezoneOffsetField />
            <div>
              <label className="label" htmlFor="title">Title</label>
              <input className="input" id="title" name="title" placeholder="e.g. LASIK summer offer" required maxLength={120} />
            </div>
            <div>
              <label className="label" htmlFor="details">What the offer is</label>
              <textarea
                className="input min-h-[100px]"
                id="details"
                name="details"
                placeholder="e.g. LASIK for both eyes is 450 OMR instead of 514 OMR. Includes the consultation."
                required
                maxLength={2000}
              />
              <p className="mt-1 text-[10px] text-slate-400">
                Write the exact prices and what&apos;s included. The AI quotes this word for word and keeps
                everything else from your knowledge base.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="startsOn">Starts on (optional)</label>
                <input className="input" id="startsOn" name="startsOn" type="date" />
              </div>
              <div>
                <label className="label" htmlFor="endsOn">Ends on (optional)</label>
                <input className="input" id="endsOn" name="endsOn" type="date" />
              </div>
            </div>
            <button className="btn" type="submit">
              <IconTag className="h-4 w-4" /> Save offer
            </button>
          </form>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-sm font-semibold text-slate-500 uppercase tracking-wider">
          Offers ({offers.length})
        </h2>
        <div className="space-y-2">
          {offers.map((o) => {
            const s = o.status;
            const from = localStartDate(o);
            const until = localEndDate(o);
            return (
              <div key={o.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{o.title}</span>
                      <span className={s.badge}>{s.label}</span>
                    </div>
                    <p className="mt-1.5 text-sm text-slate-600 whitespace-pre-wrap">{o.details}</p>
                    <p className="mt-1.5 text-xs text-slate-400">
                      {from ? `From ${from}` : "Starts immediately"} · {until ? `until ${until}` : "no end date"}
                    </p>
                  </div>
                  {isOwner && (
                    <div className="flex shrink-0 items-center gap-1">
                      <form action={setOfferActive}>
                        <input type="hidden" name="orgId" value={orgId} />
                        <input type="hidden" name="offerId" value={o.id} />
                        <input type="hidden" name="active" value={o.is_active ? "false" : "true"} />
                        <button className="btn-ghost btn-sm" type="submit">
                          {o.is_active ? "Pause" : "Resume"}
                        </button>
                      </form>
                      <form action={deleteOffer}>
                        <input type="hidden" name="orgId" value={orgId} />
                        <input type="hidden" name="offerId" value={o.id} />
                        <button className="btn-icon text-red-400 hover:text-red-600 hover:bg-red-50" type="submit" aria-label="Delete offer">
                          <IconTrash className="h-4 w-4" />
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {offers.length === 0 && (
            <div className="card text-center py-12">
              <IconTag className="mx-auto h-8 w-8 text-slate-200" />
              <p className="mt-3 text-sm text-slate-400">No offers yet</p>
              <p className="mt-1 text-xs text-slate-400">
                Add one and the AI starts quoting it right away, without touching your knowledge base
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
