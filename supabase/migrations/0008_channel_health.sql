-- Channel health tracking: last send error + token refresh timestamp.
-- Used by /api/cron/refresh-tokens + the outbound send path to surface
-- invalidated tokens on the channels page.

alter table public.channels
  add column if not exists last_error       text,
  add column if not exists last_error_at    timestamptz,
  add column if not exists token_refreshed_at timestamptz;

comment on column public.channels.last_error is
  'Last sendOutbound or token-refresh error. Cleared on successful send.';
comment on column public.channels.token_refreshed_at is
  'When the long-lived token was last extended via Meta refresh endpoint.';
