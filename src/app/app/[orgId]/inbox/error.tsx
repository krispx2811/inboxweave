"use client";

/**
 * Error boundary for the inbox route. Surfaces the underlying error
 * instead of the generic 500 so we can actually diagnose prod failures.
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
          Something threw during the page render. Share the details below with
          support so it can be fixed.
        </p>
        <dl className="mt-4 space-y-2 text-xs text-red-900">
          <div>
            <dt className="font-semibold">Message</dt>
            <dd className="font-mono break-all">{error.message || "(no message)"}</dd>
          </div>
          {error.digest && (
            <div>
              <dt className="font-semibold">Digest</dt>
              <dd className="font-mono">{error.digest}</dd>
            </div>
          )}
          {error.stack && (
            <div>
              <dt className="font-semibold">Stack</dt>
              <dd>
                <pre className="whitespace-pre-wrap font-mono text-[10px]">
                  {error.stack.slice(0, 1500)}
                </pre>
              </dd>
            </div>
          )}
        </dl>
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
