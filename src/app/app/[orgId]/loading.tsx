// Shown instantly while a page's server data loads, so navigating between
// sections gives immediate feedback instead of looking frozen.
export default function Loading() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10 animate-pulse" aria-busy="true">
      <div className="mb-8 h-7 w-48 rounded bg-slate-200" />
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {["messages", "conversations", "ai-rate", "tokens"].map((stat) => (
          <div key={stat} className="h-24 rounded-xl bg-slate-100" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-slate-100" />
    </main>
  );
}
