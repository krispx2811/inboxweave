import "server-only";

/**
 * Lightweight Sentry integration without the SDK dependency.
 * Set SENTRY_DSN in env to enable. Reports errors via the Sentry envelope API.
 * For a full integration, install @sentry/nextjs and follow their docs.
 */

const DSN = process.env.SENTRY_DSN;

interface SentryDsn {
  publicKey: string;
  projectId: string;
  host: string;
}

function parseDsn(dsn: string): SentryDsn | null {
  try {
    const url = new URL(dsn);
    return {
      publicKey: url.username,
      projectId: url.pathname.replace("/", ""),
      host: url.host,
    };
  } catch {
    return null;
  }
}

export async function captureException(error: unknown, context?: Record<string, unknown>): Promise<void> {
  if (!DSN) return;
  const parsed = parseDsn(DSN);
  if (!parsed) return;

  const err = error instanceof Error ? error : new Error(String(error));
  const envelope = JSON.stringify({
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: new Date().toISOString(),
    platform: "node",
    level: "error",
    exception: {
      values: [
        {
          type: err.name,
          value: err.message,
          stacktrace: err.stack
            ? {
                frames: err.stack
                  .split("\n")
                  .slice(1, 10)
                  .map((line) => ({ filename: line.trim() })),
              }
            : undefined,
        },
      ],
    },
    extra: context,
  });

  const storeUrl = `https://${parsed.host}/api/${parsed.projectId}/store/?sentry_key=${parsed.publicKey}&sentry_version=7`;

  await fetch(storeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: envelope,
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}
