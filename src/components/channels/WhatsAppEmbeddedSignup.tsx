"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  orgId: string;
  fbAppId: string;
  configId: string;
}

declare global {
  interface Window {
    FB?: {
      init: (opts: Record<string, unknown>) => void;
      login: (
        cb: (response: {
          authResponse?: { code?: string };
          status?: string;
        }) => void,
        opts: Record<string, unknown>,
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

/**
 * Meta Embedded Signup launcher. Loads the Facebook JS SDK on click,
 * opens the Embedded Signup popup, then POSTs the resulting `code` to
 * /api/meta/wa-embedded/callback for token exchange + channel creation.
 */
export function WhatsAppEmbeddedSignup({ orgId, fbAppId, configId }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading-sdk" | "waiting-popup" | "exchanging">("idle");
  const sdkLoaded = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (sdkLoaded.current) return;
    sdkLoaded.current = true;
    window.fbAsyncInit = () => {
      window.FB?.init({
        appId: fbAppId,
        cookie: false,
        xfbml: false,
        version: "v21.0",
      });
    };
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    document.head.appendChild(script);
  }, [fbAppId]);

  function launch() {
    if (!window.FB) {
      setError("Facebook SDK still loading — try again in a moment.");
      return;
    }
    setError(null);
    setPending(true);
    setPhase("waiting-popup");

    window.FB.login(
      async (response) => {
        const code = response.authResponse?.code;
        if (!code) {
          setPending(false);
          setPhase("idle");
          setError("Signup was cancelled or didn't complete.");
          return;
        }
        setPhase("exchanging");
        try {
          const res = await fetch("/api/meta/wa-embedded/callback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orgId, code }),
          });
          if (!res.ok) {
            const body = await res.text();
            throw new Error(body.slice(0, 240));
          }
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setPending(false);
          setPhase("idle");
        }
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {} },
      },
    );
  }

  return (
    <div>
      <button
        onClick={launch}
        disabled={pending}
        className="btn !bg-emerald-600 hover:!bg-emerald-700 !text-white"
      >
        {pending
          ? phase === "waiting-popup"
            ? "Waiting for Meta…"
            : phase === "exchanging"
              ? "Linking…"
              : "Loading…"
          : "Connect with Embedded Signup"}
      </button>
      {error && (
        <div className="mt-2 text-xs text-red-600 break-words">
          {error}
        </div>
      )}
    </div>
  );
}
