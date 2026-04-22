-- Track when we last fetched a conversation's IG profile so we can
-- refresh stale profile picture URLs (Instagram CDN URLs typically
-- expire within a few hours).

alter table public.conversations
  add column if not exists contact_profile_fetched_at timestamptz;

comment on column public.conversations.contact_profile_fetched_at is
  'Last time we called the IG Graph API to refresh contact profile info. Used to bust stale profile_pic URLs.';
