-- ============================================================================
-- 0006 — Split Meta credentials into Instagram + Facebook sets
-- Instagram Business Login uses a different app ID/secret than the Meta app
-- used for Facebook Login/Messenger/WhatsApp. Allow orgs to configure both.
-- ============================================================================

alter table public.meta_settings
  add column if not exists ig_app_id                text,
  add column if not exists ig_app_secret_ciphertext bytea,
  add column if not exists fb_app_id                text,
  add column if not exists fb_app_secret_ciphertext bytea;

-- For existing rows, copy the legacy app_id/app_secret to the Facebook columns.
-- (They were the Meta App values in the old schema.)
update public.meta_settings
set fb_app_id = app_id,
    fb_app_secret_ciphertext = app_secret_ciphertext
where fb_app_id is null and app_id is not null;
