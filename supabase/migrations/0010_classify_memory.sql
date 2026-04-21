-- Auto-classification + cross-conversation memory support.
--
-- priority: one of 'urgent' | 'normal' | 'low', set by the async classifier
--   on each inbound so the inbox can surface urgent/complaint conversations
--   to the top.
-- category: free-text topic from the classifier (e.g. 'pricing', 'booking',
--   'complaint', 'support'). Used for dashboard breakdowns; also populated
--   into conversations.tags by the classifier for visual consistency.

alter table public.conversations
  add column if not exists priority text not null default 'normal'
    check (priority in ('urgent', 'normal', 'low')),
  add column if not exists category text;

create index if not exists conversations_priority_recency_idx
  on public.conversations (priority, last_message_at desc);

comment on column public.conversations.priority is
  'Set by the async classifier on inbound. Urgent = complaint/angry/payment issue.';
comment on column public.conversations.category is
  'Topic from the classifier — pricing/booking/complaint/support/other.';
