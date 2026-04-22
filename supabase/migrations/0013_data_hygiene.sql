-- Data hygiene: duplicate cleanup + uniqueness guard + retention functions
-- for tables that accumulate sensitive/noisy rows.

-- 1) Drop duplicate messages that share a platform_message_id, keeping the
-- earliest one. These pre-date the webhook dedup fix.
delete from public.messages m
using (
  select min(created_at) as first_ts, platform_message_id
  from public.messages
  where platform_message_id is not null
  group by platform_message_id
  having count(*) > 1
) d
where m.platform_message_id = d.platform_message_id
  and m.created_at > d.first_ts;

-- 2) Enforce uniqueness so duplicates cannot re-appear.
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'messages_platform_message_id_uniq'
  ) then
    create unique index messages_platform_message_id_uniq
      on public.messages (platform_message_id)
      where platform_message_id is not null;
  end if;
end $$;

-- 3) Purge diagnostic rows that should not be kept.
delete from public.audit_logs
where action in ('composer_debug', 'inbox_render_error');

-- 4) Retention helper functions. Call these periodically (from a cron job
-- or manually) to keep sensitive/noisy rows from accumulating.
create or replace function public.purge_webhook_debug(keep_days int default 7)
returns integer
language plpgsql
security definer
as $$
declare
  deleted int;
begin
  delete from public.webhook_debug
  where created_at < now() - (keep_days || ' days')::interval;
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

create or replace function public.purge_old_audit_logs(keep_days int default 90)
returns integer
language plpgsql
security definer
as $$
declare
  deleted int;
begin
  delete from public.audit_logs
  where created_at < now() - (keep_days || ' days')::interval
    and action not in ('channel_disconnected', 'channel_connected', 'member_added', 'member_removed', 'organization_created');
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

comment on function public.purge_webhook_debug is
  'Delete webhook_debug rows older than keep_days. Meant to be called periodically.';
comment on function public.purge_old_audit_logs is
  'Delete audit_logs rows older than keep_days, preserving a small set of long-lived governance actions.';
