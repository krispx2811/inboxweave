"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// One inbound message causes a burst of writes (the message, the
// conversation's timestamp, language, sentiment, category, then the AI
// reply). Refreshing on each re-rendered the whole inbox 6-8 times, so
// collect a burst into one refresh, and skip refreshing a hidden tab until
// it's looked at again.
const REFRESH_DELAY_MS = 1500;

export function RealtimeRefresher({ orgId }: { orgId: string }) {
  const router = useRouter();

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pendingWhileHidden = false;

    const scheduleRefresh = () => {
      if (document.hidden) {
        pendingWhileHidden = true;
        return;
      }
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        router.refresh();
      }, REFRESH_DELAY_MS);
    };
    const onVisible = () => {
      if (!document.hidden && pendingWhileHidden) {
        pendingWhileHidden = false;
        scheduleRefresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`org:${orgId}:messages`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `org_id=eq.${orgId}` },
        (payload) => {
          scheduleRefresh();
          // Browser push notification for inbound messages.
          if (
            payload.new &&
            (payload.new as { direction: string }).direction === "in" &&
            "Notification" in window &&
            Notification.permission === "granted" &&
            document.hidden
          ) {
            const content = (payload.new as { content: string }).content;
            new Notification("New message", {
              body: content.length > 80 ? content.slice(0, 80) + "..." : content,
              icon: "/favicon.ico",
            });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "internal_notes", filter: `org_id=eq.${orgId}` },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [orgId, router]);

  return null;
}
