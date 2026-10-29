import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { escapePostgrestSearch } from "@/lib/search";
import { getLatestMessages, type LatestMessage } from "@/lib/inbox/latest-messages";
import { contactDisplayName, previewPrefix } from "@/lib/inbox/display";
import { IconInbox } from "@/components/icons";
import { bulkAction } from "@/app/app/[orgId]/inbox/actions";
import { BulkActions } from "./BulkActions";
import { ContactAvatar } from "./ContactAvatar";
import { RelativeTime } from "./RelativeTime";
import { inboxRenderError } from "./render-error";
import { LIST_MAX, LIST_STEP, inboxHref, type InboxState } from "./inbox-url";
import { Deco, IconPin, chipClass, focusRing } from "./ui";

// Only what a row renders.
const LIST_COLUMNS =
  "id, contact_name, contact_username, contact_profile_url, contact_external_id, ai_enabled, last_message_at, status, is_pinned, priority, read_at, channels(platform)";

interface ListRow {
  id: string;
  contact_name: string | null;
  contact_username: string | null;
  contact_profile_url: string | null;
  contact_external_id: string;
  ai_enabled: boolean;
  last_message_at: string;
  status: string;
  is_pinned: boolean;
  priority: string;
  read_at: string | null;
  channels: { platform: string } | null;
}

export async function ConversationList({ orgId, state }: { orgId: string; state: InboxState }) {
  try {
    return await renderList(orgId, state);
  } catch (err) {
    throw await inboxRenderError(orgId, err);
  }
}

async function renderList(orgId: string, state: InboxState) {
  const admin = createSupabaseAdminClient();
  const renderedAt = Date.now();

  // Pinned first, then urgent → normal → low (which is also reverse
  // alphabetical), then most recent: sorted by the database so paging is stable.
  let query = admin
    .from("conversations")
    .select(LIST_COLUMNS)
    .eq("org_id", orgId)
    .order("is_pinned", { ascending: false })
    .order("priority", { ascending: false })
    .order("last_message_at", { ascending: false })
    .limit(state.n);
  const safeQ = state.q ? escapePostgrestSearch(state.q) : "";
  if (safeQ) query = query.or(`contact_name.ilike.%${safeQ}%,contact_username.ilike.%${safeQ}%,contact_external_id.ilike.%${safeQ}%`);
  if (state.status) query = query.eq("status", state.status);
  if (state.tag) query = query.contains("tags", [state.tag]);

  const [listRes, tagsRes] = await Promise.all([
    query,
    admin.from("conversations").select("tags").eq("org_id", orgId).not("tags", "is", null).limit(1000),
  ]);
  if (listRes.error) throw new Error(listRes.error.message);
  const rows = (listRes.data ?? []) as unknown as ListRow[];
  const latest = await getLatestMessages(admin, rows.map((r) => r.id));

  // Most used tags, for the filter row.
  const tagCounts = new Map<string, number>();
  for (const r of (tagsRes.data ?? []) as Array<{ tags: string[] | null }>) {
    for (const t of r.tags ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t);
  if (state.tag && !topTags.includes(state.tag)) topTags.unshift(state.tag);

  const filtered = Boolean(state.q || state.status || state.tag);
  const canLoadMore = rows.length >= state.n && state.n < LIST_MAX;

  return (
    <>
      {topTags.length > 0 && (
        <nav aria-label="Filter by tag" className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-slate-200 px-3 py-2 [scrollbar-width:thin]">
          {topTags.map((t) => {
            const active = state.tag === t;
            return (
              <Link
                key={t}
                href={inboxHref(orgId, state, { tag: active ? null : t, n: null })}
                aria-current={active ? "true" : undefined}
                className={`${chipClass} ${focusRing} ${
                  active
                    ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
                }`}
              >
                <span dir="auto">#{t}</span>
                {active && (
                  <>
                    <span aria-hidden="true">×</span>
                    <span className="sr-only">(clear tag filter)</span>
                  </>
                )}
              </Link>
            );
          })}
        </nav>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <span aria-hidden="true" className="inline-flex">
              <IconInbox className="mx-auto h-10 w-10 text-slate-300" />
            </span>
            <p className="mt-3 text-sm text-slate-600">
              {state.q ? `No conversations match “${state.q}”.` : filtered ? "No conversations match these filters." : "No conversations yet."}
            </p>
            {filtered ? (
              <Link href={inboxHref(orgId, {})} className={`mt-2 inline-block rounded text-sm font-medium text-indigo-700 hover:underline ${focusRing}`}>
                Clear filters
              </Link>
            ) : (
              <Link href={`/app/${orgId}/channels`} className={`mt-2 inline-block rounded text-sm font-medium text-indigo-700 hover:underline ${focusRing}`}>
                Connect a channel
              </Link>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.id} className="[contain-intrinsic-size:auto_64px] [content-visibility:auto]">
                <Row orgId={orgId} state={state} row={r} latest={latest.get(r.id)} renderedAt={renderedAt} />
              </li>
            ))}
          </ul>
        )}
        {canLoadMore && (
          <div className="px-4 py-4 text-center">
            <Link
              href={inboxHref(orgId, state, { n: state.n + LIST_STEP })}
              scroll={false}
              className={`btn-ghost btn-sm ${focusRing}`}
            >
              Load more
            </Link>
          </div>
        )}
      </div>

      <BulkActions orgId={orgId} openIds={rows.filter((r) => r.status === "open").map((r) => r.id)} action={bulkAction} />
    </>
  );
}

function Row({
  orgId,
  state,
  row: r,
  latest,
  renderedAt,
}: {
  orgId: string;
  state: InboxState;
  row: ListRow;
  latest: LatestMessage | undefined;
  renderedAt: number;
}) {
  const platform = r.channels?.platform ?? null;
  const name = contactDisplayName({ ...r, platform });
  const active = state.c === r.id;
  // The open conversation is being read right now, whatever the database says.
  const unread = !active && (r.read_at == null || Date.parse(r.last_message_at) > Date.parse(r.read_at));
  const prefix = previewPrefix(latest);
  return (
    <Link
      href={inboxHref(orgId, state, { c: r.id, m: null })}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 px-4 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 ${
        active ? "bg-indigo-50 shadow-[inset_3px_0_0_theme(colors.indigo.600)]" : "hover:bg-slate-50"
      }`}
    >
      <ContactAvatar
        name={name}
        contactName={r.contact_name}
        externalId={r.contact_external_id}
        pictureUrl={r.contact_profile_url}
        platform={platform}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span dir="auto" translate="no" className={`truncate text-sm ${unread ? "font-semibold text-slate-900" : "font-medium text-slate-800"}`}>
            {name}
          </span>
          {r.is_pinned && (
            <span title="Pinned" className="inline-flex self-center text-slate-500">
              <Deco icon={IconPin} className="h-3.5 w-3.5" />
              <span className="sr-only">Pinned</span>
            </span>
          )}
          <RelativeTime
            iso={latest?.createdAt ?? r.last_message_at}
            serverNow={renderedAt}
            className={`ms-auto shrink-0 text-[11px] tabular-nums ${unread ? "font-semibold text-indigo-700" : "text-slate-500"}`}
          />
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <p className={`min-w-0 flex-1 truncate text-[13px] ${unread ? "text-slate-800" : "text-slate-500"}`}>
            {prefix && <span className={`font-medium ${prefix === "AI: " ? "text-indigo-700" : "text-slate-700"}`}>{prefix}</span>}
            {latest ? <span dir="auto">{latest.preview || "Attachment"}</span> : <span className="italic">No messages yet</span>}
          </p>
          {r.priority === "urgent" && <span className="badge-red !px-1.5 !py-0 !text-[11px]">Urgent</span>}
          {!r.ai_enabled && <span className="badge-amber !px-1.5 !py-0 !text-[11px]">AI off</span>}
          {r.status === "resolved" && <span className="badge-green !px-1.5 !py-0 !text-[11px]">Resolved</span>}
          {unread && (
            <>
              <span aria-hidden="true" className="unread-dot" />
              <span className="sr-only">Unread</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
