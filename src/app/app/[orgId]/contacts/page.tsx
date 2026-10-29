import Link from "next/link";
import type { ReactNode } from "react";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireOrgMember } from "@/lib/auth/guards";
import { escapePostgrestSearch } from "@/lib/search";
import { getLatestMessages, type LatestMessage } from "@/lib/inbox/latest-messages";
import { IconSearch } from "@/components/icons";
import { CONTACT_GRID, ContactRow, type ContactConversation } from "@/components/contacts/ContactRow";
import { LoadError, NoContacts, NoResults } from "@/components/contacts/ContactsEmpty";
import {
  CONTACTS_MAX,
  CONTACTS_PAGE_SIZE,
  normalizeContactSearch,
  parseContactLimit,
} from "@/components/contacts/format";

export const dynamic = "force-dynamic";

const numberFmt = new Intl.NumberFormat("en");
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500";

type Channel = { platform: string | null; display_name: string | null };
type Row = Omit<ContactConversation, "platform" | "channelName"> & { channels: Channel | Channel[] | null };

interface ContactsData {
  ok: boolean;
  contacts: ContactConversation[];
  latest: Map<string, LatestMessage>;
  totalCount: number;
  /** Equals totalCount when there is no search. */
  resultCount: number;
}

/**
 * Three cheap queries in parallel (one page of conversations, the total
 * count, the match count when searching), then one RPC for the last message
 * of each listed conversation. Every query is scoped to the org.
 */
async function loadContacts(orgId: string, q: string, limit: number): Promise<ContactsData> {
  const admin = createSupabaseAdminClient();
  const safeQ = escapePostgrestSearch(normalizeContactSearch(q));
  const searchFilter = safeQ
    ? `contact_name.ilike.%${safeQ}%,contact_username.ilike.%${safeQ}%,contact_external_id.ilike.%${safeQ}%`
    : null;

  // Contacts are built from conversations (the contacts table is not populated yet).
  let listQuery = admin
    .from("conversations")
    .select(
      "id, contact_name, contact_username, contact_profile_url, contact_external_id, ai_enabled, last_message_at, tags, status, language, channels(platform, display_name)",
    )
    .eq("org_id", orgId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (searchFilter) listQuery = listQuery.or(searchFilter);

  const totalQuery = admin
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);

  const matchQuery = searchFilter
    ? admin.from("conversations").select("id", { count: "exact", head: true }).eq("org_id", orgId).or(searchFilter)
    : null;

  const [list, total, matches] = await Promise.all([listQuery, totalQuery, matchQuery]);
  if (list.error) console.error("[contacts] list failed", list.error.message);

  const contacts: ContactConversation[] = ((list.data ?? []) as unknown as Row[]).map(({ channels, ...c }) => {
    const ch = Array.isArray(channels) ? channels[0] : channels;
    return { ...c, platform: ch?.platform ?? null, channelName: ch?.display_name ?? null };
  });
  const latest = await getLatestMessages(admin, contacts.map((c) => c.id));
  const totalCount = total.count ?? 0;

  return {
    ok: !list.error,
    contacts,
    latest,
    totalCount,
    resultCount: matches ? (matches.count ?? 0) : totalCount,
  };
}

export default async function ContactsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ q?: string; n?: string }>;
}) {
  const { orgId } = await params;
  await requireOrgMember(orgId);
  const { q: rawQ, n: rawN } = await searchParams;
  const q = (rawQ ?? "").trim().slice(0, 200);
  const limit = parseContactLimit(rawN);
  const { ok, contacts, latest, totalCount, resultCount } = await loadContacts(orgId, q, limit);
  const baseHref = `/app/${orgId}/contacts`;

  let body: ReactNode;
  if (!ok) {
    body = <LoadError />;
  } else if (contacts.length === 0) {
    body = q ? <NoResults query={q} clearHref={baseHref} /> : <NoContacts orgId={orgId} />;
  } else {
    const canLoadMore = contacts.length >= limit && limit < CONTACTS_MAX && resultCount > contacts.length;
    const moreParams = new URLSearchParams();
    if (q) moreParams.set("q", q);
    moreParams.set("n", String(limit + CONTACTS_PAGE_SIZE));
    body = (
      <>
        <div className="lg:overflow-hidden lg:rounded-xl lg:border lg:border-slate-200 lg:bg-white lg:shadow-sm">
          <div
            aria-hidden="true"
            className={`${CONTACT_GRID} hidden border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500 lg:grid`}
          >
            <span className="[grid-area:name]">Contact</span>
            <span className="[grid-area:preview]">Last message</span>
            <span className="[grid-area:meta]">Status &amp; details</span>
            <span className="text-right [grid-area:time]">Last active</span>
          </div>
          <ul className="space-y-2 lg:space-y-0 lg:divide-y lg:divide-slate-100" aria-label="Contacts">
            {contacts.map((c, i) => (
              <ContactRow key={c.id} orgId={orgId} contact={c} latest={latest.get(c.id)} eager={i < 10} />
            ))}
          </ul>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
          <span className="tabular-nums">
            Showing {numberFmt.format(contacts.length)} of {numberFmt.format(resultCount)}
          </span>
          {canLoadMore ? (
            <Link
              href={`${baseHref}?${moreParams.toString()}`}
              scroll={false}
              prefetch={false}
              className={`btn-ghost btn-sm ${FOCUS}`}
            >
              Load {Math.min(CONTACTS_PAGE_SIZE, resultCount - contacts.length)} More
            </Link>
          ) : null}
          {!canLoadMore && contacts.length < resultCount ? <span>Search to find older contacts.</span> : null}
        </div>
      </>
    );
  }

  return (
    <main className="mx-auto w-full min-w-0 max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="page-header">
        <h1 className="text-balance">
          Contacts
          {totalCount > 0 ? (
            <span className="ml-2 text-lg font-medium tabular-nums text-slate-400">{numberFmt.format(totalCount)}</span>
          ) : null}
        </h1>
        <p>Everyone who has messaged you, most recently active first. Open a contact to continue the conversation in the inbox.</p>
      </div>

      {totalCount > 0 || q ? (
        <form role="search" action={baseHref} className="mb-4 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              <IconSearch className="h-4 w-4" />
            </span>
            <input
              type="search"
              name="q"
              aria-label="Search contacts by name, username or ID"
              className="input !pl-10"
              placeholder="Search name or @username…"
              defaultValue={q}
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
            />
          </div>
          <button type="submit" className={`btn-ghost shrink-0 ${FOCUS}`}>
            Search
          </button>
        </form>
      ) : null}

      {q && contacts.length > 0 ? (
        <p className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
          <span>
            {numberFmt.format(resultCount)} {resultCount === 1 ? "contact matches" : "contacts match"}{" "}
            <span dir="auto" className="break-all font-medium text-slate-700">“{q}”</span>
          </span>
          <Link href={baseHref} className={`rounded font-semibold text-indigo-600 hover:underline ${FOCUS}`}>
            Clear Search
          </Link>
        </p>
      ) : null}

      {body}
    </main>
  );
}
