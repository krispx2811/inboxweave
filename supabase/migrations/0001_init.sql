-- ============================================================================
-- AI Inbox — initial schema
-- Multi-tenant messaging platform with RLS + pgvector RAG.
-- Secrets (OpenAI BYOK key, Meta tokens) are encrypted at rest by the
-- application using AES-256-GCM before being written here. They are never
-- stored in plaintext and never exposed to the browser.
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists vector;

-- ─── Core tenancy ───────────────────────────────────────────────────────────

create table if not exists public.organizations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  slug         text not null unique,
  created_at   timestamptz not null default now()
);

create type public.org_role as enum ('owner', 'agent');

create table if not exists public.org_members (
  org_id  uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role    public.org_role not null default 'agent',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists org_members_user_idx on public.org_members(user_id);

create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Helpers for RLS.
create or replace function public.is_org_member(oid uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = oid and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_platform_admin()
returns boolean language sql stable as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

-- ─── Per-org secrets & AI settings ──────────────────────────────────────────

create table if not exists public.org_secrets (
  org_id                    uuid primary key references public.organizations(id) on delete cascade,
  openai_api_key_ciphertext bytea,
  updated_at                timestamptz not null default now()
);

create table if not exists public.ai_settings (
  org_id        uuid primary key references public.organizations(id) on delete cascade,
  system_prompt text not null default 'You are a helpful customer support assistant. Be concise, friendly, and accurate.',
  model         text not null default 'gpt-4o-mini',
  temperature   real not null default 0.3,
  updated_at    timestamptz not null default now()
);

-- ─── Channels ───────────────────────────────────────────────────────────────

create type public.channel_platform as enum ('whatsapp', 'instagram', 'messenger');
create type public.channel_status as enum ('active', 'paused', 'error');

create table if not exists public.channels (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.organizations(id) on delete cascade,
  platform                  public.channel_platform not null,
  -- phone_number_id (WA) or page_id (FB/IG). Globally unique: one Meta asset
  -- can only belong to one org in this app.
  external_id               text not null unique,
  display_name              text,
  access_token_ciphertext   bytea not null,
  metadata                  jsonb not null default '{}'::jsonb,
  status                    public.channel_status not null default 'active',
  created_at                timestamptz not null default now()
);
create index if not exists channels_org_idx on public.channels(org_id);

-- ─── Conversations & messages ───────────────────────────────────────────────

create type public.message_direction as enum ('in', 'out');
create type public.message_sender as enum ('contact', 'ai', 'human');

create table if not exists public.conversations (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations(id) on delete cascade,
  channel_id            uuid not null references public.channels(id) on delete cascade,
  contact_external_id   text not null,
  contact_name          text,
  ai_enabled            boolean not null default true,
  last_message_at       timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  unique (channel_id, contact_external_id)
);
create index if not exists conversations_org_recent_idx
  on public.conversations(org_id, last_message_at desc);

create table if not exists public.messages (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations(id) on delete cascade,
  conversation_id       uuid not null references public.conversations(id) on delete cascade,
  direction             public.message_direction not null,
  sender                public.message_sender not null,
  author_user_id        uuid references auth.users(id) on delete set null,
  content               text not null,
  platform_message_id   text,
  created_at            timestamptz not null default now()
);
create index if not exists messages_conversation_idx
  on public.messages(conversation_id, created_at);

-- ─── Knowledge base (RAG) ───────────────────────────────────────────────────

create type public.doc_status as enum ('pending', 'processing', 'ready', 'error');

create table if not exists public.knowledge_documents (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  title        text not null,
  storage_path text not null,
  status       public.doc_status not null default 'pending',
  error        text,
  created_at   timestamptz not null default now()
);
create index if not exists knowledge_documents_org_idx on public.knowledge_documents(org_id);

create table if not exists public.knowledge_chunks (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.knowledge_documents(id) on delete cascade,
  org_id       uuid not null references public.organizations(id) on delete cascade,
  content      text not null,
  embedding    vector(1536),
  created_at   timestamptz not null default now()
);
create index if not exists knowledge_chunks_org_idx on public.knowledge_chunks(org_id);
create index if not exists knowledge_chunks_embedding_idx
  on public.knowledge_chunks
  using hnsw (embedding vector_cosine_ops);

-- ─── Audit ──────────────────────────────────────────────────────────────────

create table if not exists public.audit_logs (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid references public.organizations(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete set null,
  action     text not null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- All tenant tables are locked down so that a browser session can ONLY see
-- rows belonging to orgs the signed-in user is a member of. The server-side
-- service-role client (used by webhooks + admin actions) bypasses RLS.

alter table public.organizations     enable row level security;
alter table public.org_members       enable row level security;
alter table public.platform_admins   enable row level security;
alter table public.org_secrets       enable row level security;
alter table public.ai_settings       enable row level security;
alter table public.channels          enable row level security;
alter table public.conversations     enable row level security;
alter table public.messages          enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks  enable row level security;
alter table public.audit_logs        enable row level security;

-- Organizations: members can see their orgs; admins can see all.
create policy "orgs: members read" on public.organizations
  for select using (public.is_org_member(id) or public.is_platform_admin());

-- Org members: a user can see their own membership rows; admins all.
create policy "org_members: self read" on public.org_members
  for select using (user_id = auth.uid() or public.is_platform_admin());

-- Platform admins: only admins can see the table.
create policy "platform_admins: self" on public.platform_admins
  for select using (user_id = auth.uid());

-- Org-scoped tables share the same shape: allow read if member, mutations are
-- done server-side with the service role.
do $$
declare
  t text;
begin
  foreach t in array array[
    'org_secrets','ai_settings','channels','conversations',
    'messages','knowledge_documents','knowledge_chunks','audit_logs'
  ] loop
    execute format('create policy "%I: member read" on public.%I for select using (public.is_org_member(org_id));', t, t);
  end loop;
end $$;

-- Never let the client read ciphertext columns directly even as a member;
-- block the whole org_secrets table for anon/auth except via service role.
drop policy if exists "org_secrets: member read" on public.org_secrets;

-- ─── Realtime ───────────────────────────────────────────────────────────────
-- Make messages + conversations available to Supabase Realtime.
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;

-- ─── RAG retrieval function ─────────────────────────────────────────────────
-- Called by the server with the service role. Returns top-k chunks for an org.
create or replace function public.match_knowledge_chunks(
  p_org_id  uuid,
  p_query   vector(1536),
  p_limit   int default 5
) returns table (
  content  text,
  distance float
) language sql stable as $$
  select c.content, c.embedding <=> p_query as distance
  from public.knowledge_chunks c
  where c.org_id = p_org_id
  order by c.embedding <=> p_query
  limit p_limit;
$$;
