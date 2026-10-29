/** Lightweight placeholders shown while the list and the chat pane stream in. */

export function ListSkeleton() {
  return (
    <div className="flex-1 overflow-hidden motion-safe:animate-pulse" aria-busy="true" aria-label="Loading conversations">
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <div className="h-10 w-10 shrink-0 rounded-full bg-slate-100" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-2/5 rounded bg-slate-200" />
            <div className="h-3 w-4/5 rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col motion-safe:animate-pulse" aria-busy="true" aria-label="Loading conversation">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="h-10 w-10 rounded-full bg-slate-100" />
        <div className="space-y-2">
          <div className="h-3 w-36 rounded bg-slate-200" />
          <div className="h-3 w-24 rounded bg-slate-100" />
        </div>
      </div>
      <div className="flex-1 space-y-4 px-6 py-6">
        <div className="h-10 w-2/5 rounded-2xl bg-white" />
        <div className="ms-auto h-14 w-1/2 rounded-2xl bg-indigo-100" />
        <div className="h-10 w-1/3 rounded-2xl bg-white" />
        <div className="ms-auto h-10 w-2/5 rounded-2xl bg-slate-200" />
      </div>
      <div className="h-16 border-t border-slate-200 bg-white" />
    </div>
  );
}
