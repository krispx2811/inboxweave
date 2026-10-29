"use client";

import { useActionState } from "react";
import {
  checkWhatsAppChannel,
  subscribeWhatsAppChannel,
  type WhatsAppCheckState,
} from "@/app/app/[orgId]/channels/actions";

/**
 * "Test connection" for a WhatsApp channel: asks Meta whether the token is
 * valid and permanent, the number is live, and the app receives the
 * account's webhooks, and offers a one-click fix for the last one.
 */
export function WhatsAppConnectionCheck({ orgId, channelId }: { orgId: string; channelId: string }) {
  const [checkState, check, checking] = useActionState<WhatsAppCheckState, FormData>(checkWhatsAppChannel, null);
  const [subState, subscribe, subscribing] = useActionState<WhatsAppCheckState, FormData>(subscribeWhatsAppChannel, null);
  // Whichever ran last is the current picture.
  const state = subState ?? checkState;
  const health = state?.health;

  return (
    <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2.5 text-xs">
      <div className="flex items-center justify-between gap-3">
        <span className="text-slate-600">
          {health ? (health.ok ? "Everything is working" : "Something needs fixing") : "Check that this number can send and receive"}
        </span>
        <form action={check}>
          <input type="hidden" name="orgId" value={orgId} />
          <input type="hidden" name="channelId" value={channelId} />
          <button className="btn-ghost btn-sm" type="submit" disabled={checking}>
            {checking ? "Checking…" : "Test connection"}
          </button>
        </form>
      </div>

      {health && (
        <ul className="mt-2.5 space-y-1.5" aria-live="polite">
          {health.checks.map((c) => (
            <li key={c.label} className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className={`mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full ${c.ok ? "bg-emerald-500" : "bg-amber-500"}`}
              />
              <span>
                <span className="font-medium text-slate-800">{c.label}:</span>{" "}
                <span className="text-slate-600">{c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {health?.canSubscribe && (
        <form action={subscribe} className="mt-2.5">
          <input type="hidden" name="orgId" value={orgId} />
          <input type="hidden" name="channelId" value={channelId} />
          <button className="btn btn-sm" type="submit" disabled={subscribing}>
            {subscribing ? "Subscribing…" : "Turn on incoming messages"}
          </button>
        </form>
      )}

      {state?.message && <p className="mt-2 text-emerald-700" role="status">{state.message}</p>}
      {state?.error && <p className="mt-2 text-red-600" role="alert">{state.error}</p>}
    </div>
  );
}
