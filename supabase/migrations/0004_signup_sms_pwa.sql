-- ============================================================================
-- 0004 — Public signup, SMS channel, 2FA, GDPR
-- ============================================================================

-- Add 'sms' to channel_platform enum.
alter type public.channel_platform add value if not exists 'sms';

-- ─── 2FA secrets ────────────────────────────────────────────────────────────

create table if not exists public.totp_secrets (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  secret_ciphertext bytea not null,
  is_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

-- ─── GDPR deletion requests ────────────────────────────────────────────────

create type public.gdpr_status as enum ('pending', 'completed', 'rejected');

create table if not exists public.gdpr_requests (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  contact_external_id text not null,
  request_type    text not null, -- 'export' or 'delete'
  status          public.gdpr_status not null default 'pending',
  requested_by    uuid references auth.users(id) on delete set null,
  completed_at    timestamptz,
  result_url      text,
  created_at      timestamptz not null default now()
);
create index if not exists gdpr_requests_org_idx on public.gdpr_requests(org_id);

-- ─── SMS channel settings ───────────────────────────────────────────────────

create table if not exists public.sms_settings (
  org_id              uuid primary key references public.organizations(id) on delete cascade,
  twilio_account_sid  text not null,
  twilio_auth_token_ciphertext bytea not null,
  twilio_phone_number text not null,
  created_at          timestamptz not null default now()
);

-- ─── Push notification subscriptions ────────────────────────────────────────

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.totp_secrets        enable row level security;
alter table public.gdpr_requests       enable row level security;
alter table public.sms_settings        enable row level security;
alter table public.push_subscriptions  enable row level security;

create policy "totp: self" on public.totp_secrets
  for select using (user_id = auth.uid());

create policy "gdpr: member read" on public.gdpr_requests
  for select using (public.is_org_member(org_id));

create policy "sms: member read" on public.sms_settings
  for select using (public.is_org_member(org_id));

create policy "push: self" on public.push_subscriptions
  for select using (user_id = auth.uid());

-- ─── Allow public sign-up ───────────────────────────────────────────────────
-- (Supabase auth allows sign-up by default; the app previously just didn't
-- expose a /signup route. No schema change needed — this is an app-layer
-- decision.)
