"use client";

/**
 * Error boundary for the inbox route. Shows only the Next.js digest
 * (which maps to the real error in Netlify/Vercel logs) — no message,
 * no stack trace. This avoids leaking app internals to authenticated
 * users; the digest is enough for support to look up the cause.
 */
export default function InboxError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="rounded-lg border border-red-200 bg-red-50 p-5">
        <h1 className="text-lg font-semibold text-red-900">Inbox failed to load</h1>
        <p className="mt-1 text-sm text-red-800">
          Something went wrong rendering your inbox. We've logged the error —
          please try again. If this keeps happening, share the reference id
          below with support.
        </p>
        {error.digest && (
          <div className="mt-3 text-[11px] text-red-800">
            Reference: <span className="font-mono">{error.digest}</span>
          </div>
        )}
        <button
          onClick={reset}
          className="mt-5 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
