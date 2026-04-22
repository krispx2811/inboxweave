-- Per-org OpenAI Admin API key (separate from the regular API key).
-- The admin key (sk-admin-...) is used only to fetch authoritative billing
-- and usage data from OpenAI's /v1/organization endpoints. Kept encrypted
-- with the same envelope format as openai_api_key_ciphertext.

alter table public.org_secrets
  add column if not exists openai_admin_key_ciphertext bytea;

comment on column public.org_secrets.openai_admin_key_ciphertext is
  'Optional OpenAI Admin key (sk-admin-...) used to query authoritative cost + usage from OpenAI directly. Encrypted.';
