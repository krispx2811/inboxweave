-- Per-channel toggle for auto-accepting Instagram / Messenger message
-- requests (messages from non-followers that land in the "Requests" folder
-- instead of Primary). When enabled, we poll the Graph API on every
-- webhook event + every minute via cron, accept pending conversations,
-- and process their messages through the normal inbound pipeline.

alter table public.channels
  add column if not exists auto_accept_requests boolean not null default true,
  add column if not exists last_request_poll_at timestamptz;

comment on column public.channels.auto_accept_requests is
  'If true, pending IG/Messenger message requests are auto-accepted and processed as normal inbound.';
comment on column public.channels.last_request_poll_at is
  'Last time the request-poll job ran against this channel — used for diagnostics.';
