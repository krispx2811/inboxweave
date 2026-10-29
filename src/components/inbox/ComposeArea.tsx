import { IconBolt, IconNote, IconSparkle } from "@/components/icons";
import { stripMarkdown } from "@/lib/channels/format";
import { addInternalNote, refreshSuggestions, scheduleMessage, sendManualReply } from "@/app/app/[orgId]/inbox/actions";
import { Composer } from "./Composer";
import { ScheduleForm } from "./ScheduleForm";
import { SubmitButton } from "./SubmitButton";
import { Deco, chipClass, focusRing } from "./ui";

function Hidden({ orgId, conversationId }: { orgId: string; conversationId: string }) {
  return (
    <>
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="conversationId" value={conversationId} />
    </>
  );
}

/** Suggested and canned replies, the composer, and the note / schedule drawer. */
export function ComposeArea({
  orgId,
  conversationId,
  aiEnabled,
  suggestions,
  cannedReplies,
}: {
  orgId: string;
  conversationId: string;
  aiEnabled: boolean;
  suggestions: string[];
  cannedReplies: Array<{ id: string; title: string; content: string }>;
}) {
  return (
    <div className="shrink-0 border-t border-slate-200 bg-white">
      {!aiEnabled && (
        <p className="flex items-center gap-1.5 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-800">
          <Deco icon={IconSparkle} className="h-3.5 w-3.5" />
          AI replies are paused here. Your team answers this customer.
        </p>
      )}

      <div className="flex items-center gap-1.5 overflow-x-auto px-4 pt-2 [scrollbar-width:thin]">
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-indigo-700">
          <Deco icon={IconSparkle} className="h-3.5 w-3.5" /> Suggested
        </span>
        {suggestions.map((raw, i) => {
          const text = stripMarkdown(raw);
          return (
            <form key={i} action={sendManualReply} className="shrink-0">
              <Hidden orgId={orgId} conversationId={conversationId} />
              <input type="hidden" name="text" value={raw} />
              <SubmitButton
                title={`Send: ${text}`}
                pendingLabel="Sending…"
                className={`${chipClass} max-w-[16rem] border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100 ${focusRing}`}
              >
                <span dir="auto" className="truncate">{text}</span>
              </SubmitButton>
            </form>
          );
        })}
        <form action={refreshSuggestions} className="shrink-0">
          <Hidden orgId={orgId} conversationId={conversationId} />
          <SubmitButton
            pendingLabel="Thinking…"
            className={`${chipClass} border-transparent text-indigo-700 hover:bg-indigo-50 ${focusRing}`}
          >
            <Deco icon={IconBolt} className="h-3.5 w-3.5" />
            {suggestions.length > 0 ? "Refresh" : "Get suggestions"}
          </SubmitButton>
        </form>
      </div>

      {cannedReplies.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto px-4 pt-1.5 [scrollbar-width:thin]">
          <span className="shrink-0 text-xs font-medium text-slate-600">Quick replies</span>
          {cannedReplies.map((r) => (
            <form key={r.id} action={sendManualReply} className="shrink-0">
              <Hidden orgId={orgId} conversationId={conversationId} />
              <input type="hidden" name="text" value={r.content} />
              <SubmitButton
                title={`Send: ${r.content}`}
                pendingLabel="Sending…"
                className={`${chipClass} max-w-[12rem] border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-800 ${focusRing}`}
              >
                <span dir="auto" className="truncate">{r.title}</span>
              </SubmitButton>
            </form>
          ))}
        </div>
      )}

      <div className="px-4 py-2.5">
        <Composer orgId={orgId} conversationId={conversationId} send={sendManualReply} />
      </div>

      <details className="border-t border-slate-100 px-4 py-2">
        <summary className={`cursor-pointer rounded text-xs font-medium text-slate-600 hover:text-slate-900 ${focusRing}`}>
          Add an internal note or schedule a message
        </summary>
        <div className="grid grid-cols-1 gap-4 pb-1 pt-2 sm:grid-cols-2">
          <form action={addInternalNote} className="space-y-1.5">
            <Hidden orgId={orgId} conversationId={conversationId} />
            <label htmlFor="note-content" className="flex items-center gap-1 text-xs font-medium text-slate-700">
              <Deco icon={IconNote} className="h-3.5 w-3.5 text-amber-600" /> Internal note
            </label>
            <textarea
              id="note-content"
              name="content"
              dir="auto"
              rows={3}
              className="input !text-sm"
              placeholder="Only your team sees this…"
              autoComplete="off"
              required
            />
            <SubmitButton className={`btn-ghost btn-sm ${focusRing}`} pendingLabel="Saving…">Save note</SubmitButton>
          </form>
          <ScheduleForm orgId={orgId} conversationId={conversationId} action={scheduleMessage} />
        </div>
      </details>
    </div>
  );
}
