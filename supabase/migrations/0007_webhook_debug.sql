-- ============================================================================
-- 0007 — Debug log for incoming webhooks
-- Every incoming request is recorded before signature verification so we can
-- see if Meta is actually reaching our server.
-- ============================================================================

create table if not exists public.webhook_debug (
  id            uuid primary key default gen_random_uuid(),
  platform      text not null,
  org_id        uuid references public.organizations(id) on delete set null,
  method        text not null,
  status_code   int,
  signature_ok  boolean,
  parsed_count  int,
  raw_body      text,
  query_string  text,
  error         text,
  created_at    timestamptz not null default now()
);
create index if not exists webhook_debug_recent_idx on public.webhook_debug(created_at desc);

alter table public.webhook_debug enable row level security;

-- No read access needed via RLS — only viewed by server-side admin.
