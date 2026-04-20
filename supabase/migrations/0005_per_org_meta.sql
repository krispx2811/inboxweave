-- ============================================================================
-- 0005 — Per-organization Meta app credentials
-- Each org brings their own Meta developer app instead of sharing a global one.
-- ============================================================================

create table if not exists public.meta_settings (
  org_id                    uuid primary key references public.organizations(id) on delete cascade,
  app_id                    text,
  app_secret_ciphertext     bytea,
  webhook_verify_token      text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

alter table public.meta_settings enable row level security;

create policy "meta_settings: member read" on public.meta_settings
  for select using (public.is_org_member(org_id));
