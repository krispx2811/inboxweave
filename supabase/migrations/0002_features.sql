-- ============================================================================
-- 0002 — Feature expansion: contacts, canned replies, internal notes,
-- conversation tags, agent assignment, scheduled messages, usage metering,
-- media support, WhatsApp templates.
-- ============================================================================

-- Enable trigram for fuzzy search (must come before any gin_trgm_ops index).
create extension if not exists pg_trgm;

-- ─── Contacts ───────────────────────────────────────────────────────────────

create table if not exists public.contacts (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  external_id         text not null,
  platform            public.channel_platform not null,
  display_name        text,
  phone               text,
  email               text,
  notes               text,
  tags                text[] not null default '{}',
  metadata            jsonb not null default '{}'::jsonb,
  first_seen_at       timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  unique (org_id, external_id, platform)
);
create index if not exists contacts_org_idx on public.contacts(org_id);
create index if not exists contacts_name_idx on public.contacts using gin (display_name gin_trgm_ops);

-- ─── Canned replies ─────────────────────────────────────────────────────────

create table if not exists public.canned_replies (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  title      text not null,
  content    text not null,
  shortcut   text,
  category   text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists canned_replies_org_idx on public.canned_replies(org_id);

-- ─── Internal notes ─────────────────────────────────────────────────────────

create table if not exists public.internal_notes (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  author_user_id  uuid not null references auth.users(id) on delete cascade,
  content         text not null,
  created_at      timestamptz not null default now()
);
create index if not exists internal_notes_convo_idx on public.internal_notes(conversation_id, created_at);

-- ─── Conversation tags ──────────────────────────────────────────────────────

alter table public.conversations
  add column if not exists tags text[] not null default '{}',
  add column if not exists status text not null default 'open',
  add column if not exists assigned_user_id uuid references auth.users(id) on delete set null,
  add column if not exists language text;

create index if not exists conversations_tags_idx on public.conversations using gin (tags);
create index if not exists conversations_status_idx on public.conversations(org_id, status);
create index if not exists conversations_assigned_idx on public.conversations(org_id, assigned_user_id);

-- ─── Media on messages ──────────────────────────────────────────────────────

alter table public.messages
  add column if not exists media_url text,
  add column if not exists media_type text,
  add column if not exists media_mime text;

-- ─── Scheduled messages ─────────────────────────────────────────────────────

create type public.schedule_status as enum ('pending', 'sent', 'failed', 'cancelled');

create table if not exists public.scheduled_messages (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  content         text not null,
  scheduled_at    timestamptz not null,
  status          public.schedule_status not null default 'pending',
  created_by      uuid references auth.users(id) on delete set null,
  sent_at         timestamptz,
  error           text,
  created_at      timestamptz not null default now()
);
create index if not exists scheduled_messages_pending_idx
  on public.scheduled_messages(scheduled_at) where status = 'pending';

-- ─── Usage / token metering ─────────────────────────────────────────────────

create table if not exists public.usage_logs (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  model           text not null,
  prompt_tokens   int not null default 0,
  completion_tokens int not null default 0,
  total_tokens    int not null default 0,
  cost_usd        real not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists usage_logs_org_date_idx on public.usage_logs(org_id, created_at desc);

-- ─── WhatsApp message templates ─────────────────────────────────────────────

create table if not exists public.wa_templates (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  channel_id      uuid not null references public.channels(id) on delete cascade,
  template_name   text not null,
  language_code   text not null default 'en',
  category        text,
  body_text       text,
  created_at      timestamptz not null default now()
);
create index if not exists wa_templates_org_idx on public.wa_templates(org_id);

-- ─── RLS for new tables ─────────────────────────────────────────────────────

alter table public.contacts           enable row level security;
alter table public.canned_replies     enable row level security;
alter table public.internal_notes     enable row level security;
alter table public.scheduled_messages enable row level security;
alter table public.usage_logs         enable row level security;
alter table public.wa_templates       enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'contacts','canned_replies','internal_notes',
    'scheduled_messages','usage_logs','wa_templates'
  ] loop
    execute format(
      'create policy "%I: member read" on public.%I for select using (public.is_org_member(org_id));',
      t, t
    );
  end loop;
end $$;

-- ─── Analytics helper views ─────────────────────────────────────────────────

create or replace function public.org_analytics(
  p_org_id uuid,
  p_days int default 30
) returns json language plpgsql stable as $$
declare
  v_since timestamptz := now() - (p_days || ' days')::interval;
  v_messages json;
  v_conversations json;
  v_channels json;
  v_daily json;
  v_usage json;
begin
  select row_to_json(t) into v_messages from (
    select
      count(*) as total_messages,
      count(*) filter (where direction = 'in') as inbound,
      count(*) filter (where direction = 'out') as outbound,
      count(*) filter (where sender = 'ai') as ai_replies,
      count(*) filter (where sender = 'human') as human_replies,
      count(*) filter (where sender = 'contact') as contact_messages
    from public.messages
    where org_id = p_org_id and created_at >= v_since
  ) t;

  select row_to_json(t) into v_conversations from (
    select
      count(*) as total_conversations,
      count(*) filter (where ai_enabled) as ai_enabled_count
    from public.conversations
    where org_id = p_org_id
  ) t;

  select json_agg(row_to_json(t)) into v_channels from (
    select ch.platform, count(m.id) as message_count
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    join public.channels ch on ch.id = c.channel_id
    where m.org_id = p_org_id and m.created_at >= v_since
    group by ch.platform
  ) t;

  select json_agg(row_to_json(t) order by t.day) into v_daily from (
    select date_trunc('day', created_at)::date as day,
           count(*) filter (where direction = 'in') as inbound,
           count(*) filter (where direction = 'out') as outbound
    from public.messages
    where org_id = p_org_id and created_at >= v_since
    group by date_trunc('day', created_at)::date
  ) t;

  select row_to_json(t) into v_usage from (
    select
      coalesce(sum(total_tokens), 0) as total_tokens,
      coalesce(sum(cost_usd), 0) as total_cost
    from public.usage_logs
    where org_id = p_org_id and created_at >= v_since
  ) t;

  return json_build_object(
    'messages', v_messages,
    'conversations', v_conversations,
    'channels', v_channels,
    'daily', v_daily,
    'usage', v_usage
  );
end;
$$;

-- ─── Full-text search on messages ───────────────────────────────────────────

create index if not exists messages_content_search_idx
  on public.messages using gin (to_tsvector('english', content));

create or replace function public.search_conversations(
  p_org_id uuid,
  p_query  text,
  p_limit  int default 20
) returns table (
  conversation_id uuid,
  contact_name    text,
  contact_external_id text,
  snippet         text,
  rank            real
) language sql stable as $$
  select distinct on (m.conversation_id)
    m.conversation_id,
    c.contact_name,
    c.contact_external_id,
    ts_headline('english', m.content, plainto_tsquery('english', p_query),
                'MaxWords=30, MinWords=10') as snippet,
    ts_rank(to_tsvector('english', m.content), plainto_tsquery('english', p_query)) as rank
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where m.org_id = p_org_id
    and to_tsvector('english', m.content) @@ plainto_tsquery('english', p_query)
  order by m.conversation_id, rank desc
  limit p_limit;
$$;

-- Realtime for new tables.
alter publication supabase_realtime add table public.internal_notes;
