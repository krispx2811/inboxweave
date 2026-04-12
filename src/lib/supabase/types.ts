/**
 * Minimal hand-rolled database typing. Mirrors `supabase/migrations/0001_init.sql`.
 * When you want stricter types later, replace with output from
 *   supabase gen types typescript --local > src/lib/supabase/types.ts
 */

export type ChannelPlatform = "whatsapp" | "instagram" | "messenger" | "email" | "sms";
export type ChannelStatus = "active" | "paused" | "error";
export type MessageDirection = "in" | "out";
export type MessageSender = "contact" | "ai" | "human";
export type DocStatus = "pending" | "processing" | "ready" | "error";
export type OrgRole = "owner" | "agent";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface OrgMember {
  org_id: string;
  user_id: string;
  role: OrgRole;
  created_at: string;
}

export interface AiSettings {
  org_id: string;
  system_prompt: string;
  model: string;
  temperature: number;
  updated_at: string;
}

export interface Channel {
  id: string;
  org_id: string;
  platform: ChannelPlatform;
  external_id: string;
  display_name: string | null;
  access_token_ciphertext: string; // bytea hex string when read via supabase-js
  metadata: Record<string, unknown>;
  status: ChannelStatus;
  created_at: string;
}

export interface Conversation {
  id: string;
  org_id: string;
  channel_id: string;
  contact_external_id: string;
  contact_name: string | null;
  ai_enabled: boolean;
  last_message_at: string;
  created_at: string;
}

export interface Message {
  id: string;
  org_id: string;
  conversation_id: string;
  direction: MessageDirection;
  sender: MessageSender;
  author_user_id: string | null;
  content: string;
  platform_message_id: string | null;
  created_at: string;
}

export interface KnowledgeDocument {
  id: string;
  org_id: string;
  title: string;
  storage_path: string;
  status: DocStatus;
  error: string | null;
  created_at: string;
}

/**
 * Loose Database interface accepted by @supabase/supabase-js generics.
 * Using `any` for row shapes avoids fighting the generator while still giving
 * us a single type parameter to thread through the codebase.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
