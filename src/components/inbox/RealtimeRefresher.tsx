"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function RealtimeRefresher({ orgId }: { orgId: string }) {
  const router = useRouter();

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return;
    }
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`org:${orgId}:messages`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `org_id=eq.${orgId}` },
        (payload) => {
          router.refresh();
          // Browser push notification for inbound messages.
          if (
            payload.new &&
            (payload.new as { direction: string }).direction === "in" &&
            typeof window !== "undefined" &&
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
        { event: "*", schema: "public", table: "conversations", filter: `org_id=eq.${orgId}` },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "internal_notes", filter: `org_id=eq.${orgId}` },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orgId, router]);

  return null;
}
