"use client";

import { useEffect, useRef } from "react";

/**
 * Hidden form field carrying the browser's UTC offset (getTimezoneOffset, in
 * minutes), so a server action can turn date-only inputs into the right
 * instants in the user's own timezone.
 */
export function TimezoneOffsetField({ name = "tzOffset" }: { name?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.value = String(new Date().getTimezoneOffset());
  }, []);
  return <input ref={ref} type="hidden" name={name} defaultValue="0" />;
}
