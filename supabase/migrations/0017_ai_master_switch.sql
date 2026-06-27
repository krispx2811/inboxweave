-- ============================================================================
-- 0017 — Global AI master switch
-- Account-wide kill switch for the AI auto-reply, surfaced as a toggle on the
-- dashboard. When false, the AI stops auto-replying across ALL conversations
-- and channels; inbound messages still land in the inbox for a human. This is
-- independent of the per-conversation conversations.ai_enabled flag.
-- ============================================================================

alter table public.ai_settings
  add column if not exists ai_enabled boolean not null default true;
