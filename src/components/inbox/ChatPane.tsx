import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireOrgMember } from "@/lib/auth/guards";
import { contactDisplayName, contactHandle } from "@/lib/inbox/display";
import { ChatHeader } from "./ChatHeader";
import { ComposeArea } from "./ComposeArea";
import { MarkRead } from "./MarkRead";
import { Thread, type ThreadMessage, type ThreadNote } from "./Thread";
import { inboxRenderError } from "./render-error";
import { THREAD_MAX, THREAD_STEP, inboxHref, type InboxState } from "./inbox-url";
import { focusRing } from "./ui";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

const CONVERSATION_COLUMNS =
  "id, contact_name, contact_username, contact_profile_url, contact_external_id, ai_enabled, last_message_at, tags, status, assigned_user_id, sentiment, summary, is_pinned, is_escalated, read_at, channels(platform, display_name)";

interface ConversationRow {
  id: string;
  contact_name: string | null;
  contact_username: string | null;
  contact_profile_url: string | null;
  contact_external_id: string;
  ai_enabled: boolean;
  last_message_at: string;
  tags: string[] | null;
  status: string;
  assigned_user_id: string | null;
  sentiment: string | null;
  summary: string | null;
  is_pinned: boolean;
  is_escalated: boolean;
  read_at: string | null;
  channels: { platform: string; display_name: string | null } | null;
}

interface MessageRow {
  id: string;
  direction: "in" | "out";
  sender: "contact" | "ai" | "human";
  content: string | null;
  created_at: string;
  author_user_id: string | null;
  media_url: string | null;
  media_type: string | null;
}

/**
 * The open conversation. Streams in its own Suspense boundary so the list
 * never waits for it; everything it needs is fetched in parallel. Every query
 * is filtered by org as well as conversation.
 */
export async function ChatPane({ orgId, state, conversationId }: { orgId: string; state: InboxState; conversationId: string }) {
  // Cached per request: the page already checked membership.
  const ctx = await requireOrgMember(orgId);
  try {
    return await renderChat(orgId, state, conversationId, ctx.userId);
  } catch (err) {
    throw await inboxRenderError(orgId, err);
  }
}

// Org members with their emails, for assignment and author names.
async function loadTeam(admin: AdminClient, orgId: string) {
  const { data } = await admin.from("org_members").select("user_id").eq("org_id", orgId);
  return Promise.all(
    ((data ?? []) as Array<{ user_id: string }>).map(async ({ user_id }) => {
      try {
        const { data: u } = await admin.auth.admin.getUserById(user_id);
        return { id: user_id, email: u?.user?.email ?? null };
      } catch (err) {
        // Non-fatal: without auth admin access the menu shows "Team member".
        console.error("[inbox] getUserById failed (non-fatal)", err);
        return { id: user_id, email: null };
      }
    }),
  );
}

function shortName(email: string | null | undefined): string | null {
  return email ? email.split("@")[0] ?? email : null;
}

async function renderChat(orgId: string, state: InboxState, id: string, userId: string) {
  const admin = createSupabaseAdminClient();
  const [convRes, msgRes, notesRes, suggestRes, cannedRes, team] = await Promise.all([
    admin.from("conversations").select(CONVERSATION_COLUMNS).eq("id", id).eq("org_id", orgId).maybeSingle(),
    // Newest page, reversed below, so long chats show their latest messages.
    admin
      .from("messages")
      .select("id, direction, sender, content, created_at, author_user_id, media_url, media_type")
      .eq("conversation_id", id)
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(state.m),
    admin
      .from("internal_notes")
      .select("id, content, author_user_id, created_at")
      .eq("conversation_id", id)
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(100),
    admin.from("suggested_replies").select("suggestions").eq("conversation_id", id).eq("org_id", orgId).limit(1),
    admin.from("canned_replies").select("id, title, content").eq("org_id", orgId).order("title").limit(8),
    loadTeam(admin, orgId),
  ]);
  if (convRes.error) throw new Error(convRes.error.message);
  const conv = convRes.data as unknown as ConversationRow | null;

  const backHref = inboxHref(orgId, state, { c: null, m: null });
  if (!conv) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm text-slate-600">This conversation doesn’t exist or was removed.</p>
        <Link href={backHref} className={`rounded text-sm font-medium text-indigo-700 hover:underline ${focusRing}`}>
          Back to conversations
        </Link>
      </div>
    );
  }
  if (msgRes.error) throw new Error(msgRes.error.message);

  const emails = new Map(team.map((m) => [m.id, m.email]));
  const authorName = (uid: string | null) =>
    uid && uid === userId ? "You" : (shortName(uid ? emails.get(uid) : null) ?? "Team");

  const rows = ((msgRes.data ?? []) as MessageRow[]).slice().reverse();
  const messages: ThreadMessage[] = rows.map((m) => ({
    id: m.id,
    direction: m.direction,
    sender: m.sender,
    content: m.content ?? "",
    createdAt: m.created_at,
    mediaUrl: m.media_url,
    mediaType: m.media_type,
    author: m.sender === "human" ? authorName(m.author_user_id) : null,
  }));
  const earlierHref =
    rows.length >= state.m && state.m < THREAD_MAX ? inboxHref(orgId, state, { m: state.m + THREAD_STEP }) : null;
  // With older messages not loaded, older notes would look newer than they are.
  const oldestShown = earlierHref && rows[0] ? Date.parse(rows[0].created_at) : -Infinity;
  const notes: ThreadNote[] = ((notesRes.data ?? []) as Array<{ id: string; content: string; author_user_id: string; created_at: string }>)
    .filter((n) => Date.parse(n.created_at) >= oldestShown)
    .map((n) => ({ id: n.id, content: n.content, author: authorName(n.author_user_id), createdAt: n.created_at }));

  const suggestionRow = (suggestRes.data?.[0] ?? null) as { suggestions: Array<{ text: string }> | null } | null;
  const suggestions = (suggestionRow?.suggestions ?? []).map((s) => s.text).filter(Boolean);
  const cannedReplies = (cannedRes.data ?? []) as Array<{ id: string; title: string; content: string }>;

  const unread = conv.read_at == null || Date.parse(conv.last_message_at) > Date.parse(conv.read_at);
  const platform = conv.channels?.platform ?? null;

  return (
    <>
      {unread && <MarkRead orgId={orgId} conversationId={conv.id} lastMessageAt={conv.last_message_at} />}
      <ChatHeader
        orgId={orgId}
        backHref={backHref}
        team={team}
        conv={{
          id: conv.id,
          name: contactDisplayName({ ...conv, platform }),
          handle: contactHandle(conv),
          contactName: conv.contact_name,
          externalId: conv.contact_external_id,
          pictureUrl: conv.contact_profile_url,
          platform,
          channelName: conv.channels?.display_name ?? null,
          status: conv.status,
          aiEnabled: conv.ai_enabled,
          isPinned: conv.is_pinned,
          isEscalated: conv.is_escalated,
          sentiment: conv.sentiment,
          summary: conv.summary,
          assignedUserId: conv.assigned_user_id,
          tags: conv.tags ?? [],
        }}
      />
      <Thread messages={messages} notes={notes} earlierHref={earlierHref} />
      <ComposeArea
        orgId={orgId}
        conversationId={conv.id}
        aiEnabled={conv.ai_enabled}
        suggestions={suggestions}
        cannedReplies={cannedReplies}
      />
    </>
  );
}
