-- ============================================================================
-- 0021 — Comment-to-DM for Instagram
-- When someone comments on an Instagram account that turned this on, we reply
-- under the comment and DM them a button; tapping it sends the owner's link
-- once they follow. One settings row per Instagram channel, one event row per
-- person per post. channels.granted_scopes records what the account allowed
-- at connect time, so we know whether it has comment access.
-- ============================================================================

alter table public.channels
  add column if not exists granted_scopes text[];

comment on column public.channels.granted_scopes is
  'Permissions granted at the last Instagram connect. Null = connected before 0021 (no comment access).';

create table if not exists public.comment_dm_settings (
  channel_id            uuid primary key references public.channels(id) on delete cascade,
  org_id                uuid not null references public.organizations(id) on delete cascade,
  enabled               boolean not null default false,
  link_url              text,
  default_language      text not null default 'en' check (default_language in ('en', 'ar')),
  require_follow        boolean not null default true,
  public_reply_enabled  boolean not null default true,
  texts                 jsonb not null default '{}'::jsonb,
  updated_at            timestamptz not null default now()
);

create index if not exists comment_dm_settings_org_idx on public.comment_dm_settings(org_id);

create table if not exists public.comment_dm_events (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  channel_id          uuid not null references public.channels(id) on delete cascade,
  media_id            text not null,
  commenter_id        text not null,
  commenter_username  text,
  comment_id          text not null,
  comment_text        text,
  recipient_id        text,
  conversation_id     uuid references public.conversations(id) on delete set null,
  language            text not null check (language in ('en', 'ar')),
  status              text not null default 'pending'
                      check (status in ('pending', 'dm_sent', 'awaiting_follow', 'link_sent', 'failed')),
  tap_count           int not null default 0,
  error               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- One DM per person per post; also absorbs Meta redelivering a comment.
  unique (channel_id, media_id, commenter_id)
);

create index if not exists comment_dm_events_channel_status_idx
  on public.comment_dm_events(channel_id, status, updated_at desc);

-- Read and written only by the server with the service role, like offers (0019).
alter table public.comment_dm_settings enable row level security;
alter table public.comment_dm_events enable row level security;
grant select, insert, update, delete on public.comment_dm_settings to service_role;
grant select, insert, update, delete on public.comment_dm_events to service_role;

-- Claim the person+post row for a new comment. Returns the row when this
-- comment should get a DM, nothing when it shouldn't. A row that failed, or
-- was left pending by a run that died more than 10 minutes ago, is taken back.
create or replace function public.claim_comment_dm(
  p_org_id uuid,
  p_channel_id uuid,
  p_media_id text,
  p_commenter_id text,
  p_commenter_username text,
  p_comment_id text,
  p_comment_text text,
  p_language text
)
returns setof public.comment_dm_events
language sql
volatile
set search_path = public
as $$
  insert into public.comment_dm_events as e
    (org_id, channel_id, media_id, commenter_id, commenter_username, comment_id, comment_text, language)
  values
    (p_org_id, p_channel_id, p_media_id, p_commenter_id, p_commenter_username, p_comment_id,
     left(p_comment_text, 500), p_language)
  on conflict (channel_id, media_id, commenter_id) do update
    set comment_id = excluded.comment_id,
        comment_text = excluded.comment_text,
        commenter_username = excluded.commenter_username,
        language = excluded.language,
        status = 'pending',
        error = null,
        updated_at = now()
    where e.status = 'failed'
       or (e.status = 'pending' and e.updated_at < now() - interval '10 minutes')
  returning e.*;
$$;

revoke execute on function public.claim_comment_dm(uuid, uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_comment_dm(uuid, uuid, text, text, text, text, text, text)
  to service_role;
