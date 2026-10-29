"use client";

import { useEffect } from "react";
import { markConversationRead } from "@/app/app/[orgId]/inbox/actions";

/**
 * Marks the open conversation read once it's on screen. Re-runs when a new
 * message arrives while it's open. The action doesn't revalidate: the list
 * already shows the open conversation as read.
 */
export function MarkRead({ orgId, conversationId, lastMessageAt }: { orgId: string; conversationId: string; lastMessageAt: string }) {
  useEffect(() => {
    markConversationRead({ orgId, conversationId }).catch((err) => {
      console.error("[inbox] mark read failed", err);
    });
  }, [orgId, conversationId, lastMessageAt]);
  return null;
}
