-- ============================================================================
-- 0003 — Advanced features: sentiment, CSAT, summaries, suggested replies,
-- bookmarks, read receipts, webhook events, email channel, encryption.
-- ============================================================================

-- ─── Sentiment on conversations ─────────────────────────────────────────────

alter table public.conversations
  add column if not exists sentiment text,          -- positive, neutral, negative, angry
  add column if not exists sentiment_score real,     -- -1.0 to 1.0
  add column if not exists is_escalated boolean not null default false,
  add column if not exists escalated_at timestamptz,
  add column if not exists summary text,
  add column if not exists is_pinned boolean not null default false,
  add column if not exists read_at timestamptz,     -- when agent last read this convo
  add column if not exists first_reply_at timestamptz,
  add column if not exists resolved_at timestamptz;

create index if not exists conversations_pinned_idx on public.conversations(org_id, is_pinned) where is_pinned = true;
create index if not exists conversations_escalated_idx on public.conversations(org_id, is_escalated) where is_escalated = true;

-- ─── CSAT ratings ───────────────────────────────────────────────────────────

create table if not exists public.csat_ratings (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  contact_external_id text not null,
  rating          int not null check (rating >= 1 and rating <= 5),
  feedback        text,
  created_at      timestamptz not null default now()
);
create index if not exists csat_ratings_org_idx on public.csat_ratings(org_id, created_at desc);

-- ─── Suggested replies cache ────────────────────────────────────────────────

create table if not exists public.suggested_replies (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  suggestions     jsonb not null default '[]'::jsonb, -- array of {text: string}
  created_at      timestamptz not null default now()
);
create index if not exists suggested_replies_convo_idx on public.suggested_replies(conversation_id);

-- ─── Webhook event subscriptions ────────────────────────────────────────────

create table if not exists public.webhook_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  url        text not null,
  events     text[] not null default '{}'::text[],   -- new_message, resolved, escalated, csat
  secret     text not null,                          -- HMAC signing secret
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists webhook_subscriptions_org_idx on public.webhook_subscriptions(org_id);

-- ─── Webhook event log ──────────────────────────────────────────────────────

create table if not exists public.webhook_events (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid not null references public.webhook_subscriptions(id) on delete cascade,
  event_type      text not null,
  payload         jsonb not null,
  status_code     int,
  response_ms     int,
  created_at      timestamptz not null default now()
);
create index if not exists webhook_events_sub_idx on public.webhook_events(subscription_id, created_at desc);

-- ─── Email channel type ─────────────────────────────────────────────────────

-- Add 'email' to channel_platform enum.
alter type public.channel_platform add value if not exists 'email';

-- ─── Email-specific storage ─────────────────────────────────────────────────

create table if not exists public.email_settings (
  org_id          uuid primary key references public.organizations(id) on delete cascade,
  imap_host       text,
  imap_port       int default 993,
  smtp_host       text,
  smtp_port       int default 587,
  email_address   text,
  credentials_ciphertext bytea, -- encrypted username:password
  created_at      timestamptz not null default now()
);

-- ─── Model options on AI settings ───────────────────────────────────────────
-- model column already exists; just document available options:
-- gpt-4o-mini, gpt-4o, gpt-4.1, gpt-4.1-mini, gpt-4.1-nano

-- ─── Conversation analytics helper ──────────────────────────────────────────

create or replace function public.conversation_analytics(
  p_org_id uuid,
  p_days   int default 30
) returns json language plpgsql stable as $$
declare
  v_since timestamptz := now() - (p_days || ' days')::interval;
  v_response_times json;
  v_resolution json;
  v_hourly json;
  v_sentiment json;
  v_csat json;
begin
  select row_to_json(t) into v_response_times from (
    select
      avg(extract(epoch from rt.first_reply_time))::int as avg_first_reply_seconds,
      percentile_cont(0.5) within group (order by extract(epoch from rt.first_reply_time))::int as median_first_reply_seconds,
      percentile_cont(0.95) within group (order by extract(epoch from rt.first_reply_time))::int as p95_first_reply_seconds
    from (
      select min(m_out.created_at) - min(m_in.created_at) as first_reply_time
      from public.conversations c
      join public.messages m_in on m_in.conversation_id = c.id and m_in.direction = 'in'
      left join public.messages m_out on m_out.conversation_id = c.id and m_out.direction = 'out'
      where c.org_id = p_org_id and c.created_at >= v_since
      group by c.id
    ) rt
    where rt.first_reply_time is not null
  ) t;

  select row_to_json(t) into v_resolution from (
    select
      count(*) filter (where status = 'resolved') as resolved_count,
      count(*) as total_count,
      avg(extract(epoch from (resolved_at - created_at))) filter (where resolved_at is not null)::int as avg_resolution_seconds
    from public.conversations
    where org_id = p_org_id and created_at >= v_since
  ) t;

  select json_agg(row_to_json(t) order by t.hour) into v_hourly from (
    select extract(hour from created_at)::int as hour, count(*) as count
    from public.messages
    where org_id = p_org_id and created_at >= v_since
    group by extract(hour from created_at)::int
  ) t;

  select json_agg(row_to_json(t)) into v_sentiment from (
    select sentiment, count(*) as count
    from public.conversations
    where org_id = p_org_id and sentiment is not null
    group by sentiment
  ) t;

  select row_to_json(t) into v_csat from (
    select avg(rating)::real as avg_rating, count(*) as total_ratings
    from public.csat_ratings
    where org_id = p_org_id and created_at >= v_since
  ) t;

  return json_build_object(
    'response_times', v_response_times,
    'resolution', v_resolution,
    'hourly', v_hourly,
    'sentiment', v_sentiment,
    'csat', v_csat
  );
end;
$$;

-- ─── RLS for new tables ─────────────────────────────────────────────────────

alter table public.csat_ratings          enable row level security;
alter table public.suggested_replies     enable row level security;
alter table public.webhook_subscriptions enable row level security;
alter table public.webhook_events        enable row level security;
alter table public.email_settings        enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'csat_ratings','suggested_replies','webhook_subscriptions',
    'webhook_events','email_settings'
  ] loop
    execute format(
      'create policy "%I: member read" on public.%I for select using (public.is_org_member(org_id));',
      t, t
    );
  end loop;
end $$;
