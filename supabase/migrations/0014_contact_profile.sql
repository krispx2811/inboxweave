-- Store IG profile info per conversation so the inbox shows usernames +
-- avatars instead of raw numeric IG-scoped IDs.

alter table public.conversations
  add column if not exists contact_username text,
  add column if not exists contact_profile_url text;

comment on column public.conversations.contact_username is
  'The contact''s platform username (e.g. Instagram @handle) — enriched from the Graph API on first inbound.';
comment on column public.conversations.contact_profile_url is
  'URL to the contact''s profile picture from the platform. Usually expires after a few hours.';
