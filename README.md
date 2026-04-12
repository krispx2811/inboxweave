# AI Inbox

Multi-organization web app where each org connects its own WhatsApp, Instagram,
and Facebook Messenger accounts and gets AI-assisted replies powered by
GPT-4o-mini (BYOK OpenAI key per org). Org users get a unified realtime inbox
and can pause the AI to take over a chat manually.

Built with **Next.js 15** + **Supabase** (Postgres + Auth + Storage + Realtime +
pgvector). Deploy target: Vercel + Supabase Cloud.

---

## Architecture

```
Meta platforms ──webhook──▶ /api/webhooks/{whatsapp|instagram|messenger}
                                │ verify X-Hub-Signature-256
                                │ resolve channel → org
                                │ persist inbound message (broadcast to inbox)
                                └─ if ai_enabled: RAG + gpt-4o-mini → send reply
```

- `src/lib/supabase/{client,server,admin}.ts` — browser / RSC / service-role clients.
- `src/lib/crypto/secrets.ts` — AES-256-GCM envelope encryption for BYOK keys + Meta tokens.
- `src/lib/ai/{openai,rag}.ts` — per-org chat + embeddings, pgvector retrieval.
- `src/lib/channels/{router,whatsapp,instagram,messenger,inbound,signature}.ts` — unified send/receive.
- `src/app/app/[orgId]/{inbox,channels,knowledge,settings}` — org workspace UI.
- `src/app/admin/*` — platform admin (create orgs, provision users).
- `supabase/migrations/0001_init.sql` — schema, RLS, pgvector index, realtime publication.

Multi-tenancy is **admin-provisioned**: there is no public signup. The first
signed-in user can claim platform-admin from `/admin` if no admin exists yet.

---

## Setup

### 1. Dependencies

```bash
npm install
```

### 2. Supabase project

Either create a hosted project at [supabase.com](https://supabase.com) or run
locally with `supabase start`. Apply the schema:

```bash
# local
supabase db reset               # runs supabase/migrations/0001_init.sql
# remote
supabase db push
```

### 3. Environment variables

Copy `.env.example` → `.env.local` and fill in:

```bash
cp .env.example .env.local

# Generate the 32-byte secrets key:
openssl rand -hex 32
```

Required:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from Supabase project settings.
- `SUPABASE_SERVICE_ROLE_KEY` — same place. **Server-only**; never expose to the client.
- `SECRETS_ENCRYPTION_KEY` — 32-byte hex. Used to encrypt per-org OpenAI keys + Meta tokens.
- `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` — from your Meta developer app.
- `NEXT_PUBLIC_APP_URL` — public base URL (e.g. `https://your.vercel.app` or your tunnel URL).

### 4. Run

```bash
npm run dev
```

Visit `http://localhost:3000`. For Meta to reach your webhooks during dev, use
a tunnel:

```bash
cloudflared tunnel --url http://localhost:3000
```

Then use that HTTPS URL as `NEXT_PUBLIC_APP_URL` and as your webhook URL in the
Meta developer dashboard.

---

## First-time bootstrap

1. In Supabase Studio → Authentication → Add user — create yourself an account.
2. Sign in at `/login`, then visit `/admin`. If no admin exists yet, click
   **Claim admin** — you become the platform admin.
3. From `/admin`, create an organization and provision users for it.
4. Sign in as an org owner, then:
   - **Settings** → paste the org's OpenAI API key and edit the system prompt.
   - **Channels** → connect WhatsApp (phone_number_id + permanent system-user
     token) and/or Facebook Pages / Instagram via the OAuth button.
   - **Knowledge** → upload FAQs / docs (PDF / MD / TXT). They are chunked +
     embedded + stored in pgvector.

---

## Meta app configuration

In your Meta developer app, register these webhook URLs (pointing at your
deployed domain or tunnel):

- WhatsApp: `https://<host>/api/webhooks/whatsapp`
- Messenger: `https://<host>/api/webhooks/messenger`
- Instagram: `https://<host>/api/webhooks/instagram`

Use the `META_WEBHOOK_VERIFY_TOKEN` value as the verify token. Subscribe to
`messages` (and `messaging_postbacks` for Messenger) events. Page-level
subscriptions are created automatically by the OAuth callback.

---

## Security

- All per-org secrets are AES-256-GCM encrypted with `SECRETS_ENCRYPTION_KEY`
  before being written to Postgres. Plaintext only exists briefly in memory on
  server routes.
- All tenant tables have Row Level Security tied to `org_members`. The service
  role client bypasses RLS and is only imported from `server-only` files.
- Webhook handlers reject any POST whose `X-Hub-Signature-256` does not match
  an HMAC-SHA256 of the raw body with `META_APP_SECRET`.
- Webhooks are exempt from the auth middleware (see `src/middleware.ts`).

---

## Build / verify

```bash
npm run typecheck
npm run build
```

Both must pass before deploying.
