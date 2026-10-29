"use client";

import { SubmitButton } from "./SubmitButton";
import { focusRing } from "./ui";

/** Bulk actions over the open conversations currently loaded in the list. */
export function BulkActions({
  orgId,
  openIds,
  action,
}: {
  orgId: string;
  openIds: string[];
  action: (formData: FormData) => Promise<void>;
}) {
  const count = openIds.length;
  const confirmFirst = (verb: string) => (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!window.confirm(`${verb} ${count} open conversation${count === 1 ? "" : "s"} shown in the list?`)) e.preventDefault();
  };
  return (
    <details className="border-t border-slate-200 px-3 py-2 text-xs">
      <summary className={`cursor-pointer rounded font-medium text-slate-600 hover:text-slate-900 ${focusRing}`}>
        Bulk actions
      </summary>
      {count === 0 ? (
        <p className="mt-2 text-slate-500">No open conversations in this list.</p>
      ) : (
        <form action={action} className="mt-2">
          <input type="hidden" name="orgId" value={orgId} />
          <input type="hidden" name="ids" value={openIds.join(",")} />
          <p className="mb-1.5 text-slate-500">Applies to the {count} open conversation{count === 1 ? "" : "s"} in this list.</p>
          <div className="flex flex-wrap gap-1.5">
            <SubmitButton name="action" value="resolve" className={`btn-ghost btn-sm ${focusRing}`} onClick={confirmFirst("Resolve")}>
              Resolve
            </SubmitButton>
            <SubmitButton name="action" value="archive" className={`btn-ghost btn-sm ${focusRing}`} onClick={confirmFirst("Archive")}>
              Archive
            </SubmitButton>
            <SubmitButton name="action" value="tag:vip" className={`btn-ghost btn-sm ${focusRing}`}>
              Tag VIP
            </SubmitButton>
          </div>
        </form>
      )}
    </details>
  );
}
