-- ============================================================================
-- 0020 — Latest message per conversation
-- The inbox list and contacts page show each conversation's last message.
-- One indexed DISTINCT ON over messages_conversation_idx instead of loading
-- whole threads. Called by the server with the service role only.
-- ============================================================================

create or replace function public.latest_messages(p_conversation_ids uuid[])
returns table (conversation_id uuid, direction text, sender text, content text, created_at timestamptz)
language sql
stable
set search_path = public
as $$
  select distinct on (m.conversation_id)
         m.conversation_id, m.direction::text, m.sender::text, left(m.content, 240), m.created_at
  from public.messages m
  where m.conversation_id = any(p_conversation_ids)
  order by m.conversation_id, m.created_at desc;
$$;

revoke execute on function public.latest_messages(uuid[]) from public, anon, authenticated;
grant execute on function public.latest_messages(uuid[]) to service_role;
