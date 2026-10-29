-- ============================================================================
-- 0018 — Security hardening
-- 1) Lock the retention functions from 0013 down to the service role.
-- 2) Drop member-read RLS policies on tables that hold secrets. The app reads
--    all of these with the service-role client only (which bypasses RLS), so
--    the browser / anon key never needs them.
-- ============================================================================

-- ─── 1) Retention functions ─────────────────────────────────────────────────
-- SECURITY DEFINER functions are executable by PUBLIC by default, which let
-- anyone holding the anon key wipe audit_logs / webhook_debug.

create or replace function public.purge_webhook_debug(keep_days int default 7)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted int;
  days int := greatest(coalesce(keep_days, 7), 1);
begin
  delete from public.webhook_debug
  where created_at < now() - (days || ' days')::interval;
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

create or replace function public.purge_old_audit_logs(keep_days int default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted int;
  days int := greatest(coalesce(keep_days, 90), 1);
begin
  delete from public.audit_logs
  where created_at < now() - (days || ' days')::interval
    and action not in ('channel_disconnected', 'channel_connected', 'member_added', 'member_removed', 'organization_created');
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

revoke execute on function public.purge_webhook_debug(int) from public, anon, authenticated;
revoke execute on function public.purge_old_audit_logs(int) from public, anon, authenticated;
grant execute on function public.purge_webhook_debug(int) to service_role;
grant execute on function public.purge_old_audit_logs(int) to service_role;

-- ─── 2) Secret-bearing tables: no client-side reads ─────────────────────────
-- RLS stays enabled; with no policy, anon/authenticated see nothing.

-- 0001: channels.access_token_ciphertext
drop policy if exists "channels: member read" on public.channels;

-- 0003: webhook_subscriptions.secret, email_settings.credentials_ciphertext
drop policy if exists "webhook_subscriptions: member read" on public.webhook_subscriptions;
drop policy if exists "email_settings: member read" on public.email_settings;

-- 0004: sms_settings.twilio_auth_token_ciphertext, totp_secrets.secret_ciphertext
drop policy if exists "sms: member read" on public.sms_settings;
drop policy if exists "totp: self" on public.totp_secrets;

-- 0005/0006: meta_settings.*_secret_ciphertext, webhook_verify_token
drop policy if exists "meta_settings: member read" on public.meta_settings;
