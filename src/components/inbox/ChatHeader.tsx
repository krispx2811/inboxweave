import Link from "next/link";
import { IconArrowLeft, IconInbox, IconSparkle, IconTag } from "@/components/icons";
import {
  addTag, assignConversation, generateConversationSummary, removeTag, setAiEnabled,
  setConversationStatus, togglePin,
} from "@/app/app/[orgId]/inbox/actions";
import { ContactAvatar, channelLabel } from "./ContactAvatar";
import { OverflowMenu } from "./OverflowMenu";
import { SubmitButton } from "./SubmitButton";
import { Deco, IconCheck, IconPin, focusRing } from "./ui";

export interface HeaderConversation {
  id: string;
  name: string;
  handle: string | null;
  contactName: string | null;
  externalId: string;
  pictureUrl: string | null;
  platform: string | null;
  channelName: string | null;
  status: string;
  aiEnabled: boolean;
  isPinned: boolean;
  isEscalated: boolean;
  sentiment: string | null;
  summary: string | null;
  assignedUserId: string | null;
  tags: string[];
}

function Hidden({ orgId, conversationId }: { orgId: string; conversationId: string }) {
  return (
    <>
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="conversationId" value={conversationId} />
    </>
  );
}

const menuItem = `flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-start text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60 ${focusRing}`;

/**
 * Who you're talking to, plus the two actions staff use constantly
 * (resolve, pause AI). Assign, pin and summary live in the overflow menu.
 */
export function ChatHeader({
  orgId,
  conv,
  team,
  backHref,
}: {
  orgId: string;
  conv: HeaderConversation;
  team: Array<{ id: string; email: string | null }>;
  backHref: string;
}) {
  const resolved = conv.status === "resolved";
  const upset = conv.sentiment === "angry" || conv.sentiment === "negative";
  return (
    <div className="shrink-0 border-b border-slate-200 bg-white">
      <header className="flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4">
        <Link href={backHref} aria-label="Back to conversations" className={`btn-icon md:hidden ${focusRing}`}>
          <Deco icon={IconArrowLeft} className="h-5 w-5" />
        </Link>
        <ContactAvatar
          name={conv.name}
          contactName={conv.contactName}
          externalId={conv.externalId}
          pictureUrl={conv.pictureUrl}
          platform={conv.platform}
        />
        <div className="min-w-0 flex-1">
          <h1 dir="auto" translate="no" className="truncate text-sm font-semibold text-slate-900">{conv.name}</h1>
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
            {conv.handle && <span dir="auto" className="truncate">{conv.handle}</span>}
            {conv.handle && <span aria-hidden="true">·</span>}
            <span className="truncate">
              {channelLabel(conv.platform)}
              {conv.channelName && <span dir="auto"> · {conv.channelName}</span>}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {resolved && <span className="badge-green hidden lg:inline-flex">Resolved</span>}
          {conv.isEscalated && <span className="badge-amber hidden sm:inline-flex">Escalated</span>}
          {upset && (
            <span className={`hidden sm:inline-flex ${conv.sentiment === "angry" ? "badge-red" : "badge-amber"}`}>
              {conv.sentiment === "angry" ? "Angry" : "Unhappy"}
            </span>
          )}
          <form action={setConversationStatus}>
            <Hidden orgId={orgId} conversationId={conv.id} />
            <input type="hidden" name="status" value={resolved ? "open" : "resolved"} />
            <SubmitButton
              className={`btn-ghost btn-sm ${focusRing}`}
              ariaLabel={resolved ? "Reopen conversation" : "Resolve conversation"}
              pendingLabel="…"
            >
              <Deco icon={resolved ? IconInbox : IconCheck} className={`h-3.5 w-3.5 ${resolved ? "text-slate-500" : "text-emerald-600"}`} />
              <span className="hidden sm:inline">{resolved ? "Reopen" : "Resolve"}</span>
            </SubmitButton>
          </form>
          <form action={setAiEnabled}>
            <Hidden orgId={orgId} conversationId={conv.id} />
            <input type="hidden" name="enabled" value={conv.aiEnabled ? "" : "true"} />
            <SubmitButton
              className={`btn-sm ${focusRing} ${
                conv.aiEnabled ? "btn-ghost" : "btn-ghost !border-amber-300 !bg-amber-50 !text-amber-800 hover:!bg-amber-100"
              }`}
              ariaLabel={conv.aiEnabled ? "Pause AI replies" : "Resume AI replies"}
              pendingLabel="…"
            >
              <Deco icon={IconSparkle} className={`h-3.5 w-3.5 ${conv.aiEnabled ? "text-indigo-600" : ""}`} />
              <span className="hidden sm:inline">{conv.aiEnabled ? "Pause AI" : "Resume AI"}</span>
            </SubmitButton>
          </form>
          <OverflowMenu label="More actions">
            <form action={assignConversation} className="border-b border-slate-100 px-2.5 pb-2.5 pt-1">
              <Hidden orgId={orgId} conversationId={conv.id} />
              <label htmlFor="assign-user" className="mb-1 block text-xs font-medium text-slate-700">Assigned to</label>
              <div className="flex gap-1.5">
                <select
                  id="assign-user"
                  name="userId"
                  defaultValue={conv.assignedUserId ?? ""}
                  className={`min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 ${focusRing}`}
                >
                  <option value="">Unassigned</option>
                  {team.map((m) => (
                    <option key={m.id} value={m.id}>{m.email ?? "Team member"}</option>
                  ))}
                </select>
                <SubmitButton className={`btn btn-sm ${focusRing}`} pendingLabel="Saving…">Assign</SubmitButton>
              </div>
            </form>
            <form action={togglePin} className="pt-1">
              <Hidden orgId={orgId} conversationId={conv.id} />
              <input type="hidden" name="pinned" value={conv.isPinned ? "" : "true"} />
              <SubmitButton className={menuItem}>
                <Deco icon={IconPin} className="h-4 w-4 text-slate-500" />
                {conv.isPinned ? "Unpin from top" : "Pin to top"}
              </SubmitButton>
            </form>
            <form action={generateConversationSummary}>
              <Hidden orgId={orgId} conversationId={conv.id} />
              <SubmitButton className={menuItem} pendingLabel="Writing summary…">
                <Deco icon={IconSparkle} className="h-4 w-4 text-indigo-600" />
                {conv.summary ? "Regenerate summary" : "Generate summary"}
              </SubmitButton>
            </form>
          </OverflowMenu>
        </div>
      </header>

      {conv.summary && (
        <details className="group border-t border-slate-100 px-4 py-1.5 text-xs text-slate-600">
          <summary className={`flex cursor-pointer list-none items-center gap-1.5 rounded [&::-webkit-details-marker]:hidden ${focusRing}`}>
            <span className="shrink-0 font-medium text-slate-700">Summary</span>
            <span dir="auto" className="min-w-0 flex-1 truncate group-open:hidden">{conv.summary}</span>
          </summary>
          <p dir="auto" className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{conv.summary}</p>
        </details>
      )}

      <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 px-4 py-1.5">
        <Deco icon={IconTag} className="h-3.5 w-3.5 text-slate-500" />
        {conv.tags.map((t) => (
          <form key={t} action={removeTag} className="inline-flex">
            <Hidden orgId={orgId} conversationId={conv.id} />
            <input type="hidden" name="tag" value={t} />
            <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 py-0.5 pe-0.5 ps-2 text-xs font-medium text-slate-700">
              <span dir="auto">{t}</span>
              <SubmitButton
                ariaLabel={`Remove tag ${t}`}
                className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-900 ${focusRing}`}
              >
                <span aria-hidden="true">×</span>
              </SubmitButton>
            </span>
          </form>
        ))}
        <form action={addTag} className="inline-flex">
          <Hidden orgId={orgId} conversationId={conv.id} />
          <input
            name="tag"
            aria-label="Add a tag"
            placeholder="Add tag…"
            maxLength={30}
            autoComplete="off"
            enterKeyHint="done"
            dir="auto"
            required
            className="w-24 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-slate-900 placeholder:text-slate-500 hover:border-slate-200 focus-visible:border-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30"
          />
        </form>
      </div>
    </div>
  );
}
