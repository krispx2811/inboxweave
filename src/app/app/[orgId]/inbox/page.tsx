import { Suspense } from "react";
import Link from "next/link";
import { requireOrgMember } from "@/lib/auth/guards";
import { RealtimeRefresher } from "@/components/inbox/RealtimeRefresher";
import { NotificationPrompt } from "@/components/inbox/NotificationPrompt";
import { ConversationList } from "@/components/inbox/ConversationList";
import { ChatPane } from "@/components/inbox/ChatPane";
import { ChatSkeleton, ListSkeleton } from "@/components/inbox/Skeletons";
import { inboxRenderError } from "@/components/inbox/render-error";
import { inboxHref, parseInboxState, type InboxState, type RawSearch } from "@/components/inbox/inbox-url";
import { focusRing } from "@/components/inbox/ui";
import { IconInbox, IconSearch } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function InboxPage(props: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<RawSearch>;
}) {
  // Outside the try: the redirect() thrown on failure must not be caught.
  const { orgId } = await props.params;
  await requireOrgMember(orgId);
  try {
    return renderInbox(orgId, parseInboxState(await props.searchParams));
  } catch (err) {
    // Logged to audit_logs so it can be diagnosed without host logs. The list
    // and chat pane stream separately and log their own failures the same way.
    throw await inboxRenderError(orgId, err);
  }
}

const STATUS_TABS = [
  { value: undefined, label: "All" },
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
] as const;

function renderInbox(orgId: string, state: InboxState) {
  const selectedId = state.c;
  return (
    <div className="flex h-full flex-col">
      <RealtimeRefresher orgId={orgId} />
      <NotificationPrompt />
      <div className="flex min-h-0 flex-1">
        {/* List: always on desktop; on mobile only when no conversation is open. */}
        <aside
          aria-label="Conversations"
          className={`${selectedId ? "hidden md:flex" : "flex"} w-full min-w-0 shrink-0 flex-col border-e border-slate-200 bg-white md:w-80 lg:w-96`}
        >
          <ListToolbar orgId={orgId} state={state} />
          {/* Not keyed: opening a conversation keeps the current list on screen until the new one is ready. */}
          <Suspense fallback={<ListSkeleton />}>
            <ConversationList orgId={orgId} state={state} />
          </Suspense>
        </aside>

        <main className={`${selectedId ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col bg-slate-50`}>
          {selectedId ? (
            // Keyed by conversation so switching shows the skeleton at once,
            // while "Load earlier" (same key) keeps the thread in place.
            <Suspense key={selectedId} fallback={<ChatSkeleton />}>
              <ChatPane orgId={orgId} state={state} conversationId={selectedId} />
            </Suspense>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-500">
              <span aria-hidden="true" className="inline-flex">
                <IconInbox className="h-12 w-12 text-slate-300" />
              </span>
              <p className="text-sm">Select a conversation to read and reply.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

/** Search and status filter: static, so they show before the list has loaded. */
function ListToolbar({ orgId, state }: { orgId: string; state: InboxState }) {
  return (
    <div className="shrink-0 space-y-2 border-b border-slate-200 p-3">
      <form role="search" className="relative" action={`/app/${orgId}/inbox`}>
        <span aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 inline-flex -translate-y-1/2">
          <IconSearch className="h-4 w-4 text-slate-500" />
        </span>
        <label htmlFor="inbox-search" className="sr-only">Search conversations</label>
        <input
          id="inbox-search"
          name="q"
          type="search"
          dir="auto"
          autoComplete="off"
          spellCheck={false}
          defaultValue={state.q ?? ""}
          placeholder="Search name or @username…"
          className="input !py-2 !ps-9 !text-sm"
        />
        {state.c && <input type="hidden" name="c" value={state.c} />}
        {state.status && <input type="hidden" name="status" value={state.status} />}
        {state.tag && <input type="hidden" name="tag" value={state.tag} />}
      </form>
      <nav aria-label="Filter by status" className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
        {STATUS_TABS.map((t) => {
          const active = state.status === t.value;
          return (
            <Link
              key={t.label}
              href={inboxHref(orgId, state, { status: t.value ?? null, n: null })}
              aria-current={active ? "true" : undefined}
              className={`flex-1 rounded-md px-2 py-1 text-center text-xs font-medium transition-colors ${focusRing} ${
                active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
