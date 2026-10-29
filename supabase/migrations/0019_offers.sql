-- ============================================================================
-- 0019 — Offers
-- Time-limited promotions the AI quotes ahead of the knowledge base, so a
-- business can run an offer without editing its knowledge documents and have
-- it stop by itself when it ends. starts_at / ends_at are null for "no limit".
-- tz_offset_minutes is the creator's UTC offset (JS getTimezoneOffset sign),
-- used to show the offer's dates in the business's own calendar.
-- ============================================================================

create table if not exists public.offers (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  title             text not null,
  details           text not null,
  starts_at         timestamptz,
  ends_at           timestamptz,
  tz_offset_minutes int not null default 0,
  is_active         boolean not null default true,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint offers_dates_ordered check (starts_at is null or ends_at is null or starts_at <= ends_at)
);

create index if not exists offers_org_active_idx on public.offers(org_id) where is_active;

-- Read and written only by the server with the service role, like the other
-- business-data tables since 0018: RLS on, no client policies.
alter table public.offers enable row level security;
grant select, insert, update, delete on public.offers to service_role;
