import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { RealtimeRefresher } from "@/components/inbox/RealtimeRefresher";
import { NotificationPrompt } from "@/components/inbox/NotificationPrompt";
import {
  sendManualReply, setAiEnabled, addTag, removeTag,
  setConversationStatus, assignConversation, addInternalNote, scheduleMessage,
  togglePin, markRead, generateConversationSummary, refreshSuggestions, bulkAction,
} from "./actions";
import { IconSend, IconSparkle, IconInbox, IconSearch, IconTag, IconNote, IconUser, IconClock, IconPhoto, IconBolt } from "@/components/icons";
import { avatarColor, getInitials } from "@/lib/avatar";

export const dynamic = "force-dynamic";

interface Search { c?: string; q?: string; status?: string; tag?: string; }

function platformBadge(p: string | undefined) {
  switch (p) { case "whatsapp": return "badge-green"; case "instagram": return "badge-purple"; case "messenger": return "badge-blue"; default: return "badge-gray"; }
}

function timeAgo(d: string): string {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "now"; if (s < 3600) return `${Math.floor(s / 60)}m`; if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default async function InboxPage({
  params, searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Search>;
}) {
  const { orgId } = await params;
  const { c: selectedId, q, status: filterStatus, tag: filterTag } = await searchParams;
  const admin = createSupabaseAdminClient();

  // Conversations query with filters.
  let convQuery = admin
    .from("conversations")
    .select("id, contact_name, contact_external_id, ai_enabled, last_message_at, channel_id, tags, status, assigned_user_id, language, sentiment, sentiment_score, summary, is_pinned, is_escalated, read_at, channels(platform, display_name)")
    .eq("org_id", orgId)
    .order("last_message_at", { ascending: false })
    .limit(100);

  if (q) convQuery = convQuery.or(`contact_name.ilike.%${q}%,contact_external_id.ilike.%${q}%`);
  if (filterStatus) convQuery = convQuery.eq("status", filterStatus);
  if (filterTag) convQuery = convQuery.contains("tags", [filterTag]);

  const { data: conversations } = await convQuery;

  const selected = selectedId ? conversations?.find((c) => c.id === selectedId) ?? conversations?.[0] : conversations?.[0];

  // Thread + notes + canned replies + members + suggestions (in parallel).
  const [threadRes, notesRes, repliesRes, membersRes, suggestRes] = await Promise.all([
    selected
      ? admin.from("messages").select("id, direction, sender, content, created_at, author_user_id, media_url, media_type").eq("conversation_id", selected.id).order("created_at", { ascending: true }).limit(200)
      : Promise.resolve({ data: [] }),
    selected
      ? admin.from("internal_notes").select("id, content, author_user_id, created_at").eq("conversation_id", selected.id).order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
    admin.from("canned_replies").select("id, title, content, shortcut, category").eq("org_id", orgId).order("title"),
    admin.from("org_members").select("user_id, role").eq("org_id", orgId),
    selected
      ? admin.from("suggested_replies").select("suggestions").eq("conversation_id", selected.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const thread = threadRes.data ?? [];
  const notes = notesRes.data ?? [];
  const cannedReplies = repliesRes.data ?? [];
  const members = membersRes.data ?? [];
  const suggestions = ((suggestRes.data?.suggestions as Array<{ text: string }>) ?? []).map((s) => s.text);

  // Member emails for assignment.
  const emailMap = new Map<string, string>();
  if (members.length > 0) {
    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    for (const u of users?.users ?? []) emailMap.set(u.id, u.email ?? u.id);
  }

  // All tags in use.
  const allTags = [...new Set((conversations ?? []).flatMap((c) => (c.tags as string[]) ?? []))];

  const selectedTags = (selected?.tags as string[]) ?? [];
  const selectedCh = (selected as unknown as { channels?: { platform: string } })?.channels;

  return (
    <>
      <RealtimeRefresher orgId={orgId} />
      <NotificationPrompt />
      <div className="flex h-full">
        {/* ── Left: Conversation list ─────────────────────────── */}
        <div className="w-80 shrink-0 flex flex-col border-r border-slate-200 bg-white">
          {/* Search + filters */}
          <div className="border-b border-slate-100 p-3 space-y-2">
            <form className="relative">
              <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input name="q" className="input !pl-9 !py-2 !text-xs" placeholder="Search conversations..." defaultValue={q ?? ""} />
              {filterStatus && <input type="hidden" name="status" value={filterStatus} />}
              {filterTag && <input type="hidden" name="tag" value={filterTag} />}
            </form>
            <div className="flex gap-1.5 flex-wrap">
              {(["all", "open", "resolved"] as const).map((s) => (
                <Link
                  key={s}
                  href={`/app/${orgId}/inbox?${new URLSearchParams({ ...(q ? { q } : {}), ...(filterTag ? { tag: filterTag } : {}), ...(s !== "all" ? { status: s } : {}) }).toString()}`}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                    (filterStatus ?? "all") === s || (!filterStatus && s === "all")
                      ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                </Link>
              ))}
              {allTags.length > 0 && (
                <select
                  className="rounded-full border-0 bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500"
                  defaultValue={filterTag ?? ""}
                  onChange={(e) => { /* Server-side: using JS navigation */ }}
                >
                  <option value="">All tags</option>
                  {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              )}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {(conversations ?? []).map((c) => {
              const ch = (c as unknown as { channels?: { platform: string } }).channels;
              const active = selected?.id === c.id;
              const initials = getInitials(c.contact_name as string | null, c.contact_external_id as string);
              const tags = (c.tags as string[]) ?? [];
              const nameKey = (c.contact_name as string) ?? (c.contact_external_id as string);
              const colors = avatarColor(nameKey);
              const isUnread = c.read_at == null || new Date(c.last_message_at as string) > new Date(c.read_at as string);
              return (
                <Link
                  key={c.id}
                  href={`/app/${orgId}/inbox?c=${c.id}${q ? `&q=${q}` : ""}${filterStatus ? `&status=${filterStatus}` : ""}${filterTag ? `&tag=${filterTag}` : ""}`}
                  className={`flex items-center gap-3 px-4 py-3 transition-colors border-b border-slate-50 dark:border-slate-800 ${active ? "bg-indigo-50 border-l-2 border-l-indigo-600 dark:bg-indigo-950" : "hover:bg-slate-50 dark:hover:bg-slate-900"}`}
                >
                  <div className="relative">
                    <div className={`avatar-sm ${colors.bg} ${colors.text}`}>{initials}</div>
                    {isUnread && <span className="absolute -top-0.5 -right-0.5 unread-dot" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="truncate text-sm font-semibold">{(c.contact_name as string) ?? (c.contact_external_id as string)}</span>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap ml-2">{timeAgo(c.last_message_at as string)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 flex-wrap">
                      <span className={`${platformBadge(ch?.platform)} !py-0 !px-1.5 !text-[10px]`}>{ch?.platform}</span>
                      {c.language && <span className="badge-gray !py-0 !px-1 !text-[10px]">{c.language}</span>}
                      {!c.ai_enabled && <span className="badge-amber !py-0 !px-1.5 !text-[10px]">AI off</span>}
                      {(c.status as string) === "resolved" && <span className="badge-green !py-0 !px-1.5 !text-[10px]">Resolved</span>}
                      {tags.slice(0, 2).map((t) => <span key={t} className="badge-blue !py-0 !px-1.5 !text-[10px]">{t}</span>)}
                    </div>
                  </div>
                </Link>
              );
            })}
            {conversations?.length === 0 && (
              <div className="px-4 py-16 text-center">
                <IconInbox className="mx-auto h-10 w-10 text-slate-200" />
                <p className="mt-3 text-sm text-slate-400">{q ? `No results for "${q}"` : "No conversations"}</p>
              </div>
            )}
          </div>

          {/* Bulk actions */}
          <div className="border-t border-slate-100 px-3 py-2">
            <details className="text-xs">
              <summary className="cursor-pointer text-[10px] font-semibold text-slate-400 hover:text-slate-600">Bulk actions</summary>
              <form action={bulkAction} className="mt-2 space-y-2">
                <input type="hidden" name="orgId" value={orgId} />
                <input type="hidden" name="ids" value={(conversations ?? []).filter(c => (c.status as string) === "open").map(c => c.id).join(",")} />
                <div className="flex flex-wrap gap-1">
                  <button name="action" value="resolve" className="btn-ghost btn-sm !text-[10px]">Resolve all open</button>
                  <button name="action" value="archive" className="btn-ghost btn-sm !text-[10px]">Archive all open</button>
                  <button name="action" value="tag:vip" className="btn-ghost btn-sm !text-[10px]">Tag all: VIP</button>
                </div>
              </form>
            </details>
          </div>
        </div>

        {/* ── Right: Chat pane ────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col bg-slate-50">
          {selected ? (
            <>
              {/* Header */}
              <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`avatar-md ${avatarColor((selected.contact_name as string) ?? (selected.contact_external_id as string)).bg} ${avatarColor((selected.contact_name as string) ?? (selected.contact_external_id as string)).text}`}>{getInitials(selected.contact_name as string | null, selected.contact_external_id as string)}</div>
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{(selected.contact_name as string) ?? (selected.contact_external_id as string)}</div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className={platformBadge(selectedCh?.platform)}>{selectedCh?.platform}</span>
                      {selected.language && <span className="badge-gray">{selected.language}</span>}
                      {selected.ai_enabled && <span className="flex items-center gap-1 text-indigo-600"><IconSparkle className="h-3 w-3" /> AI</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Assignment */}
                  <form action={assignConversation} className="flex items-center gap-1">
                    <input type="hidden" name="orgId" value={orgId} />
                    <input type="hidden" name="conversationId" value={selected.id} />
                    <select name="userId" className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs" defaultValue={(selected.assigned_user_id as string) ?? ""}>
                      <option value="">Unassigned</option>
                      {members.map((m) => <option key={m.user_id} value={m.user_id as string}>{emailMap.get(m.user_id as string) ?? "User"}</option>)}
                    </select>
                    <button className="btn-ghost btn-sm !px-2" type="submit"><IconUser className="h-3.5 w-3.5" /></button>
                  </form>
                  {/* Status */}
                  <form action={setConversationStatus}>
                    <input type="hidden" name="orgId" value={orgId} />
                    <input type="hidden" name="conversationId" value={selected.id} />
                    <input type="hidden" name="status" value={(selected.status as string) === "open" ? "resolved" : "open"} />
                    <button className={`btn-sm ${(selected.status as string) === "resolved" ? "btn" : "btn-ghost"}`} type="submit">
                      {(selected.status as string) === "resolved" ? "Reopen" : "Resolve"}
                    </button>
                  </form>
                  {/* AI toggle */}
                  <form action={setAiEnabled}>
                    <input type="hidden" name="orgId" value={orgId} />
                    <input type="hidden" name="conversationId" value={selected.id} />
                    <input type="hidden" name="enabled" value={selected.ai_enabled ? "" : "true"} />
                    <button className={`btn-sm ${selected.ai_enabled ? "btn-ghost" : "btn"}`} type="submit">
                      <IconSparkle className="h-3.5 w-3.5" /> {selected.ai_enabled ? "Pause AI" : "Resume AI"}
                    </button>
                  </form>
                  {/* Pin */}
                  <form action={togglePin}>
                    <input type="hidden" name="orgId" value={orgId} />
                    <input type="hidden" name="conversationId" value={selected.id} />
                    <input type="hidden" name="pinned" value={selected.is_pinned ? "" : "true"} />
                    <button className={`btn-ghost btn-sm !px-2 ${selected.is_pinned ? "!bg-amber-50 !text-amber-600 !border-amber-200" : ""}`} type="submit" title={selected.is_pinned ? "Unpin" : "Pin"}>
                      {selected.is_pinned ? "Pinned" : "Pin"}
                    </button>
                  </form>
                  {/* Mark read */}
                  <form action={markRead}>
                    <input type="hidden" name="orgId" value={orgId} />
                    <input type="hidden" name="conversationId" value={selected.id} />
                    <button className="btn-ghost btn-sm !px-2" type="submit" title="Mark as read">Read</button>
                  </form>
                </div>
              </header>

              {/* Sentiment + Summary bar */}
              {(selected.sentiment || selected.summary || selected.is_escalated) && (
                <div className="flex items-center gap-2 border-b border-slate-100 bg-white px-5 py-1.5 text-xs">
                  {selected.sentiment && (
                    <span className={`badge ${
                      selected.sentiment === "angry" ? "badge-red" :
                      selected.sentiment === "negative" ? "badge-amber" :
                      selected.sentiment === "positive" ? "badge-green" : "badge-gray"
                    }`}>
                      {selected.sentiment as string}
                      {selected.sentiment_score != null && ` (${(selected.sentiment_score as number).toFixed(1)})`}
                    </span>
                  )}
                  {selected.is_escalated && <span className="badge-red">Escalated</span>}
                  {selected.summary && (
                    <span className="text-slate-500 truncate flex-1" title={selected.summary as string}>
                      Summary: {selected.summary as string}
                    </span>
                  )}
                  {!selected.summary && (
                    <form action={generateConversationSummary} className="inline">
                      <input type="hidden" name="orgId" value={orgId} />
                      <input type="hidden" name="conversationId" value={selected.id} />
                      <button className="text-indigo-500 hover:underline" type="submit">Generate summary</button>
                    </form>
                  )}
                </div>
              )}

              {/* Tags bar */}
              <div className="flex items-center gap-1.5 border-b border-slate-100 bg-white px-5 py-1.5 text-xs">
                <IconTag className="h-3.5 w-3.5 text-slate-400" />
                {selectedTags.map((t) => (
                  <form key={t} action={removeTag} className="inline">
                    <input type="hidden" name="orgId" value={orgId} />
                    <input type="hidden" name="conversationId" value={selected.id} />
                    <input type="hidden" name="tag" value={t} />
                    <button className="badge-blue group" type="submit">{t} <span className="opacity-0 group-hover:opacity-100 ml-0.5">&times;</span></button>
                  </form>
                ))}
                <form action={addTag} className="inline-flex items-center">
                  <input type="hidden" name="orgId" value={orgId} />
                  <input type="hidden" name="conversationId" value={selected.id} />
                  <input name="tag" className="w-16 rounded border-0 bg-transparent px-1 py-0.5 text-xs placeholder:text-slate-300 focus:outline-none focus:ring-0" placeholder="+ tag" />
                </form>
              </div>

              {/* Messages + notes thread */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {thread.map((m) => {
                  const mine = m.direction === "out";
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[70%] ${mine ? "text-right" : "text-left"}`}>
                        {mine && m.sender !== "contact" && (
                          <div className="mb-0.5 text-[10px] font-medium text-slate-400">
                            {m.sender === "ai" ? <span className="text-indigo-500">AI</span> : "You"}
                          </div>
                        )}
                        {/* Media */}
                        {m.media_url && (m.media_type === "image" ? (
                          <img src={m.media_url as string} alt="" className="mb-1 max-w-[240px] rounded-xl" />
                        ) : (
                          <a href={m.media_url as string} target="_blank" rel="noopener noreferrer" className="mb-1 inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-2 text-xs text-indigo-600 hover:bg-slate-200">
                            <IconPhoto className="h-4 w-4" /> {m.media_type ?? "attachment"}
                          </a>
                        ))}
                        <div className={`inline-block whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${mine ? (m.sender === "ai" ? "bg-indigo-600 text-white rounded-br-md" : "bg-slate-800 text-white rounded-br-md") : "bg-white text-slate-900 shadow-sm border border-slate-100 rounded-bl-md"}`}>
                          {m.content as string}
                        </div>
                        <div className="mt-0.5 text-[10px] text-slate-400">
                          {new Date(m.created_at as string).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {thread.length === 0 && <div className="flex h-full items-center justify-center text-sm text-slate-400">No messages yet</div>}

                {/* Internal notes */}
                {notes.length > 0 && (
                  <div className="border-t border-dashed border-amber-200 pt-3 mt-4">
                    <div className="text-[10px] font-semibold text-amber-600 mb-2 flex items-center gap-1"><IconNote className="h-3 w-3" /> Internal notes</div>
                    {notes.map((n) => (
                      <div key={n.id} className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                        <div className="text-[10px] text-amber-500 mb-0.5">{emailMap.get(n.author_user_id as string) ?? "Team"} &middot; {new Date(n.created_at as string).toLocaleString()}</div>
                        {n.content as string}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Compose area */}
              <div className="border-t border-slate-200 bg-white">
                {/* AI Suggested replies */}
                {suggestions.length > 0 && (
                  <div className="flex gap-1.5 overflow-x-auto px-4 pt-2 pb-1">
                    <span className="flex items-center gap-1 text-[10px] text-indigo-500 font-semibold shrink-0"><IconSparkle className="h-3 w-3" /> AI:</span>
                    {suggestions.map((text, i) => (
                      <form key={i} action={sendManualReply}>
                        <input type="hidden" name="orgId" value={orgId} />
                        <input type="hidden" name="conversationId" value={selected.id} />
                        <input type="hidden" name="text" value={text} />
                        <button className="whitespace-nowrap rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[10px] font-medium text-indigo-600 hover:bg-indigo-100 transition-colors" type="submit" title={text}>
                          {text.length > 50 ? text.slice(0, 50) + "..." : text}
                        </button>
                      </form>
                    ))}
                  </div>
                )}
                <div className="flex gap-1.5 items-center px-4 pt-1">
                  <form action={refreshSuggestions} className="inline">
                    <input type="hidden" name="orgId" value={orgId} />
                    <input type="hidden" name="conversationId" value={selected.id} />
                    <button className="text-[10px] text-indigo-500 hover:underline flex items-center gap-0.5" type="submit">
                      <IconBolt className="h-3 w-3" /> {suggestions.length > 0 ? "Refresh" : "Get AI suggestions"}
                    </button>
                  </form>
                </div>

                {/* Canned replies */}
                {cannedReplies.length > 0 && (
                  <div className="flex gap-1.5 overflow-x-auto px-4 pt-1 pb-1">
                    {cannedReplies.slice(0, 8).map((r) => (
                      <form key={r.id} action={sendManualReply}>
                        <input type="hidden" name="orgId" value={orgId} />
                        <input type="hidden" name="conversationId" value={selected.id} />
                        <input type="hidden" name="text" value={r.content as string} />
                        <button className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-medium text-slate-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600 transition-colors" type="submit" title={r.content as string}>
                          {r.title}
                        </button>
                      </form>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2 px-4 py-3">
                  {/* Main reply */}
                  <form action={sendManualReply} className="flex flex-1 items-center gap-2">
                    <input type="hidden" name="orgId" value={orgId} />
                    <input type="hidden" name="conversationId" value={selected.id} />
                    <input name="text" className="input flex-1 !rounded-full !px-5" placeholder="Type a message..." required autoComplete="off" />
                    <button className="btn !rounded-full !p-3" type="submit" aria-label="Send"><IconSend className="h-4 w-4" /></button>
                  </form>
                </div>

                {/* Note + schedule (collapsible) */}
                <details className="border-t border-slate-100 px-4 py-2">
                  <summary className="cursor-pointer text-[10px] font-semibold text-slate-400 hover:text-slate-600">More: add note, schedule message</summary>
                  <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 pb-2">
                    {/* Internal note */}
                    <form action={addInternalNote} className="space-y-1.5">
                      <input type="hidden" name="orgId" value={orgId} />
                      <input type="hidden" name="conversationId" value={selected.id} />
                      <label className="text-[10px] font-semibold text-amber-600 flex items-center gap-1"><IconNote className="h-3 w-3" /> Internal note</label>
                      <textarea name="content" className="input !text-xs min-h-[60px]" placeholder="Only visible to your team..." required />
                      <button className="btn-ghost btn-sm">Save note</button>
                    </form>
                    {/* Schedule */}
                    <form action={scheduleMessage} className="space-y-1.5">
                      <input type="hidden" name="orgId" value={orgId} />
                      <input type="hidden" name="conversationId" value={selected.id} />
                      <label className="text-[10px] font-semibold text-indigo-600 flex items-center gap-1"><IconClock className="h-3 w-3" /> Schedule message</label>
                      <input name="content" className="input !text-xs" placeholder="Message to schedule..." required />
                      <input name="scheduledAt" type="datetime-local" className="input !text-xs" required />
                      <button className="btn-ghost btn-sm">Schedule</button>
                    </form>
                  </div>
                </details>
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
              <IconInbox className="h-12 w-12 text-slate-200" />
              <p className="text-sm">Select a conversation</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
