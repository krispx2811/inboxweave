"use client";

import { useEffect, useRef } from "react";

interface AdSlotProps {
  slot: string;
  format?: "auto" | "horizontal" | "vertical" | "rectangle";
  className?: string;
}

/**
 * Google AdSense ad unit. Set NEXT_PUBLIC_ADSENSE_ID in env.
 * Each `slot` is a unique ad unit ID from your AdSense dashboard.
 * If AdSense isn't configured, renders nothing.
 */
export function AdSlot({ slot, format = "auto", className }: AdSlotProps) {
  const adRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);

  useEffect(() => {
    if (pushed.current) return;
    if (!process.env.NEXT_PUBLIC_ADSENSE_ID) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
      pushed.current = true;
    } catch {}
  }, []);

  if (!process.env.NEXT_PUBLIC_ADSENSE_ID) return null;

  return (
    <div className={className}>
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={process.env.NEXT_PUBLIC_ADSENSE_ID}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  );
}
