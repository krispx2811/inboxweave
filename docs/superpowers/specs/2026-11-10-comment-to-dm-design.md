# Comment-to-DM for Instagram — Design

Date: 2026-11-10
Status: Approved in brainstorming, awaiting spec review

## Goal

When someone comments on any post or reel of an Instagram account that has this
feature turned on, InboxWeave replies publicly under the comment and sends the
commenter a private DM with a button. When they tap the button, InboxWeave checks
whether they follow the account. Followers get the owner's link. Non-followers are
asked to follow first and get an "I followed" button that checks again. All texts
go out in Arabic or English, matching the comment.

The feature is off by default and is turned on per Instagram account by an org
owner.

## Decisions made in brainstorming

| Question | Decision |
|---|---|
| Which posts trigger it | All posts and reels of the account. One link and one set of texts per account. |
| Repeat commenters | One DM per person per post. |
| Public reply under the comment | Yes, on by default, editable, can be turned off. |
| Comments with no words (emoji, @tags) | Use the account's default language, chosen by the owner. |
| How it runs | Live, inside the Instagram webhook's background step (`after()`), like DMs today. No queue, no AI. |

## User flow

1. A comment arrives on an account whose Comment-to-DM switch is on and whose
   channel status is `active`.
2. Skip it when:
   - the comment's author is the account itself (owner comments and our own public
     replies — this prevents loops), or
   - this person already has a non-failed event for this post.
3. Pick the language (see "Language rule").
4. If public reply is on, reply under the comment.
5. Send the private reply DM: opening text plus a postback button
   ("Send me the link" / "أرسل لي الرابط").
6. When the person taps a button from this feature:
   - require follow is off → send the link message.
   - they follow the account → send the link message.
   - they don't follow → send the follow-first message with an "I followed ✅" /
     "تابعت ✅" button. Tapping it repeats step 6.
   - the follow check errors → send the link message anyway (fail open), and save
     the error on the event.
7. Every DM we send and every tap is saved in that person's conversation, so it
   shows in the InboxWeave inbox. If they type a message later, the normal AI
   pipeline replies as it does today.

Taps are always answered, even if the owner turned the feature off after the DM went
out.

Comment-to-DM has its own switch. The org's AI master switch does not affect it,
because it sends fixed texts and uses no AI.

## Language rule

Pure function `pickLanguage(commentText, defaultLanguage)`:

1. Remove @mentions from the text.
2. Any Arabic letter left → `ar` (reuse the Arabic range from `containsArabic` in
   `src/lib/channels/commands.ts`).
3. Otherwise, any Latin letter left → `en`.
4. Otherwise (emoji, numbers, punctuation, empty) → `defaultLanguage`.

The language is picked once from the comment, saved on the event, and reused for
every later message to that person in this flow.

## Settings (per Instagram channel)

Reached from a new line on the Instagram card on the Channels page:
"Comment to DM: On/Off · Set up". The page lives at
`/app/[orgId]/channels/comment-dm/[channelId]`. Only owners can edit; other members
see it read-only.

Fields:

- **Enabled** — off by default.
- **Link** — required before it can be turned on. Must be `https://`. Validated with
  the existing `src/lib/net/safe-url.ts` helpers.
- **Default language** — `en` or `ar`. Default `en`.
- **Require follow** — on by default.
- **Public reply** — on by default.
- **Texts**, English and Arabic side by side, prefilled with the defaults below. An
  empty field falls back to its default.

Limits (Meta's): button labels at most 20 characters, DM texts at most 640
characters, public reply at most 300 characters.

Counts shown on the page, for this channel, all time:

- DMs sent — events in `dm_sent`, `awaiting_follow` or `link_sent`
- Links sent — `link_sent`
- Waiting on a follow — `awaiting_follow`
- Failed — `failed`

Below the counts, the 5 latest failures with their error text.

Turning the switch on is refused, with a clear message, when the link is missing or
the channel has no comment access (see "Permissions and reconnect").

### Default texts

| Key | English | Arabic |
|---|---|---|
| `publicReply` (three variants, one per line; one is picked at random) | Sent you a DM 📩<br>Check your DMs 📩<br>Just sent it to your DMs 👀 | أرسلنا لك رسالة على الخاص 📩<br>تفقد رسائلك الخاصة 📩<br>أرسلنا لك التفاصيل على الخاص 👀 |
| `opening` | Hey! Thanks for your comment 🙌 Tap the button below and I'll send you the link. | أهلاً! شكراً على تعليقك 🙌 اضغط الزر تحت ونرسل لك الرابط. |
| `openingButton` | Send me the link | أرسل لي الرابط |
| `followFirst` | Almost there! Follow our account first, then tap the button below and I'll send you the link right away. | باقي خطوة! تابع حسابنا أولاً، بعدها اضغط الزر تحت ونرسل لك الرابط مباشرة. |
| `followedButton` | I followed ✅ | تابعت ✅ |
| `linkMessage` | Here's your link 🎉 | تفضل الرابط 🎉 |
| `linkButton` | Open link | افتح الرابط |

The Arabic copy is reviewed with the `ux-writing-arabic` skill during
implementation.

## Permissions and reconnect

- Comment-to-DM needs the `instagram_business_manage_comments` permission.
- The normal "Connect Instagram" button keeps its current scopes. This avoids
  breaking connect for orgs whose Meta app lacks the comments permission.
- The Comment-to-DM page shows a "Reconnect to allow comment access" button when the
  channel lacks the permission. It runs the same Instagram Business Login flow with
  `instagram_business_manage_comments` added to the scopes, through the same
  callback.
- The OAuth callback saves the granted permissions in a new
  `channels.granted_scopes` column. Meta's `permissions` field may arrive as an
  array or as a comma-separated string; accept both. `null` means "connected before
  this feature" and is treated as no comment access.
- Webhook subscription fields are built from the granted permissions:
  `messages` always; `messages,comments,messaging_postbacks` when comment access was
  granted. Both the OAuth callback and the `subscribe-ig` route use the same helper.
- Building the Instagram login URL moves into one helper used by the Channels page
  and the Comment-to-DM page.

## Data model

Migration `supabase/migrations/0021_comment_dm.sql`.

### `channels.granted_scopes`

`text[]`, nullable. Permissions granted at the last connect.

### `comment_dm_settings`

One row per Instagram channel.

| Column | Type | Notes |
|---|---|---|
| `channel_id` | uuid PK | references `channels(id)` on delete cascade |
| `org_id` | uuid not null | references `organizations(id)` on delete cascade |
| `enabled` | boolean not null default false | |
| `link_url` | text | |
| `default_language` | text not null default 'en' | check in ('en','ar') |
| `require_follow` | boolean not null default true | |
| `public_reply_enabled` | boolean not null default true | |
| `texts` | jsonb not null default '{}' | `{ en: {...}, ar: {...} }`, keys as in the defaults table, validated with zod on save |
| `updated_at` | timestamptz not null default now() | |

### `comment_dm_events`

One row per person per post.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | also the button payload |
| `org_id` | uuid not null | |
| `channel_id` | uuid not null | references `channels(id)` on delete cascade |
| `media_id` | text not null | the post or reel |
| `commenter_id` | text not null | comment `from.id` |
| `commenter_username` | text | |
| `comment_id` | text not null unique | latest comment that claimed this row |
| `comment_text` | text | trimmed to 500 chars |
| `recipient_id` | text | IGSID returned by the private reply send, or the comment's `from.id` when the response has none; used to match taps |
| `conversation_id` | uuid | references `conversations(id)` on delete set null |
| `language` | text not null | 'en' or 'ar' |
| `status` | text not null | `pending`, `dm_sent`, `awaiting_follow`, `link_sent`, `failed` |
| `tap_count` | int not null default 0 | |
| `error` | text | last error, trimmed to 300 chars |
| `created_at`, `updated_at` | timestamptz | |

Unique `(channel_id, media_id, commenter_id)` enforces "once per post" and absorbs
Meta redelivering the same comment.

**Claiming a row atomically:** SQL function `claim_comment_dm(...)` (service role
only, like `latest_messages`). It inserts a `pending` row. On conflict, it takes the
row back only when its status is `failed`, or `pending` with `updated_at` older than
10 minutes (a run that crashed halfway). Taking it back sets the new `comment_id`,
status `pending`, and clears `error`. It returns the row when claimed, nothing
otherwise. So a failed or stuck DM does not block the person, and a later comment on
the same post retries it.

**RLS:** org members can select both tables. All writes go through the service-role
client after an owner check in server actions, the same pattern as `offers`
(migration 0019).

### Status transitions

```
pending ──private reply ok──▶ dm_sent ──tap──▶ link_sent
   │                             │
   │                             └──tap, not following──▶ awaiting_follow ──tap──▶ (re-check)
   └──private reply failed──▶ failed  (a later comment on the same post can re-claim)
```

A tap on a `link_sent` event re-sends the link. That's harmless, and they may have
lost it.

## Meta API calls

All go to `graph.instagram.com/v21.0` with the channel's token, refreshed first with
`refreshIgTokenIfStale` as the inbound path does.

| Purpose | Call |
|---|---|
| Public reply | `POST /{comment_id}/replies` with `message` |
| Private reply (opening DM) | `POST /me/messages` with `recipient: { comment_id }` and a button template message. Response gives `recipient_id` + `message_id`. |
| Follow-first / link message | `POST /me/messages` with `recipient: { id: IGSID }` and a button template (postback button for follow-first, `web_url` button for the link) |
| Follow check | `GET /{IGSID}?fields=is_user_follow_business` |

Button template shape:

```json
{ "attachment": { "type": "template", "payload": {
  "template_type": "button",
  "text": "<text>",
  "buttons": [ { "type": "postback", "title": "<label>", "payload": "cdm:<event id>" } ]
} } }
```

The payload is `cdm:<event uuid>`. Both the opening button and the "I followed"
button use the same payload, because both do the same thing: check, then act.

### Verify first (first implementation task, on a real test account)

1. A private reply accepts a button template with a postback button. If it doesn't,
   use a generic template (one card, one postback button). The rest of the design is
   unchanged because both produce postbacks.
2. `is_user_follow_business` returns after a postback tap.
3. The shape of `permissions` in the token exchange response.
4. The shape of `comments` and `messaging_postbacks` webhook payloads for the
   Instagram Login API (expected below).

Expected payloads:

```json
// comment
{ "object": "instagram", "entry": [{ "id": "<IG account id>", "changes": [{
  "field": "comments",
  "value": { "id": "<comment id>", "text": "...", "parent_id": "<optional>",
             "from": { "id": "<commenter id>", "username": "..." },
             "media": { "id": "<media id>", "media_product_type": "REELS" } } }] }] }

// button tap
{ "object": "instagram", "entry": [{ "id": "<IG account id>", "messaging": [{
  "sender": { "id": "<IGSID>" }, "recipient": { "id": "<IG account id>" },
  "postback": { "mid": "<mid>", "title": "Send me the link", "payload": "cdm:<uuid>" } }] }] }
```

## Handling a tap

1. Decode the payload. If it isn't `cdm:<uuid>`, ignore it (no other Instagram
   postbacks exist today).
2. Load the event and its channel. Ignore the tap unless the channel's
   `external_id` equals the webhook `entry.id` and the event's `recipient_id` equals
   `sender.id`.
3. Dedupe with the inbox: save the tap as an inbound `contact` message with
   `platform_message_id = postback.mid`. If that mid already exists, stop — Meta
   redelivered it.
4. Increase `tap_count`. Past 10 taps, stop answering (spam guard).
5. Load the settings (the row may be disabled; still answer). If there is no link
   any more, mark the event `failed` with "no link set" and stop.
6. Run the follow logic from "User flow" step 6 and update the status.

## Inbox integration

- After the private reply succeeds, upsert the conversation with
  `contact_external_id = recipient_id`, and set `contact_username` from the comment.
- Save every DM we send as a `messages` row with `direction='out'`, `sender='ai'`,
  the text, and the returned `platform_message_id`. Using `sender='ai'` keeps the
  existing inbox rendering. Saving the message id makes the existing echo dedupe in
  `handleOwnerEcho` skip our own sends.
- Save each tap as `direction='in'`, `sender='contact'`, content = the button title.
- Bump `last_message_at`.

## Code layout

Pure modules (no `server-only`, relative imports only, so `node --test` can import
them):

- `src/lib/comment-dm/types.ts` — shared types: settings, texts, event, deps
  interfaces.
- `src/lib/comment-dm/parse.ts` — `parseCommentEvents(body)`,
  `parseTapEvents(body)`, `encodePayload(id)`, `decodePayload(payload)`.
- `src/lib/comment-dm/texts.ts` — default texts, zod settings schema,
  `resolveTexts(saved, language)`, `pickLanguage(text, default)`.
- `src/lib/comment-dm/flow.ts` — `handleComment(event, deps)` and
  `handleTap(event, deps)`. All database and Meta access goes through a `deps`
  object (`store` + `meta`), so tests pass fakes.
- `src/lib/channels/ig-scopes.ts` — `parseGrantedScopes`, `hasCommentAccess`,
  `igSubscribedFields`, `buildIgLoginUrl`.

Server-only modules:

- `src/lib/comment-dm/meta.ts` — the four Meta calls above.
- `src/lib/comment-dm/store.ts` — Supabase implementations: load settings and
  channel, `claim_comment_dm` RPC, status updates, inbox writes, counts.
- `src/lib/comment-dm/index.ts` — builds the real `deps`; exports
  `processCommentEvents(events)` and `processTapEvents(events)`.

Changes to existing files:

- `src/app/api/webhooks/instagram/route.ts` — also parse comment and tap events
  before the "nothing to do" early return. Find the org from the first event of any
  kind. Signature check and `scopeToSigningOrg` cover all three kinds. Inside
  `after()`, the existing DM loop is unchanged; then call `processCommentEvents` and
  `processTapEvents`.
- `src/app/api/meta/ig-oauth/callback/route.ts` — save `granted_scopes`; use
  `igSubscribedFields`.
- `src/app/app/[orgId]/channels/subscribe-ig/route.ts` — use `igSubscribedFields`
  from the stored scopes.
- `src/app/app/[orgId]/channels/page.tsx` — use `buildIgLoginUrl`; add the
  Comment-to-DM line to the Instagram card.

New UI:

- `src/app/app/[orgId]/channels/comment-dm/[channelId]/page.tsx` — settings form,
  reconnect button, counts, recent failures.
- `src/app/app/[orgId]/channels/comment-dm/[channelId]/actions.ts` — save settings
  (owner only, zod-validated), toggle on/off (with the link and permission checks).

Every file stays under 500 lines.

## Errors and limits

- A Meta error on the private reply (rate limit, 7-day window, user blocked
  messages) marks the event `failed` with the error text. It shows in the counts and
  the recent-failures list.
- A public reply failure is logged on the event's `error` but does not stop the
  private DM.
- Token errors (code 190) go through the existing channel health marking in
  `src/lib/channels/health.ts`, so the Channels page shows "needs reconnection" as
  it does today.
- Every comment is handled independently. One failing comment never stops the rest
  of the webhook batch, and errors are caught and logged like the existing
  `[instagram webhook]` handlers.

## Testing

Unit tests in `tests/`, run with `npm test`:

- `comment-dm-parse.test.ts` — comment and tap payloads, unrelated events ignored,
  payload encode/decode, foreign payloads rejected.
- `comment-dm-texts.test.ts` — `pickLanguage` (Arabic, English, mixed, emoji-only,
  @tag-only, empty), defaults filling empty fields, schema rejects non-https links
  and button labels over 20 characters.
- `comment-dm-flow.test.ts` with fake `deps` — skips own comments; skips when
  disabled or the channel isn't active; once per post; a failed row is retried by a
  later comment; public reply off; private reply failure → `failed`; tap → follows
  → link; tap → not following → follow-first; follow check error → link; require
  follow off → link; tap on mismatched sender ignored; duplicate tap mid ignored;
  tap cap; tap after the feature was turned off still answered.
- `ig-scopes.test.ts` — scopes as array or string, subscription fields with and
  without comment access, login URL with and without the comments scope.

Before shipping, run it end to end on a real test Instagram account: comment in
Arabic, English and emoji only; tap as a follower and a non-follower; follow, then
tap "I followed".

## Meta setup (owner tasks, not code)

- In the Meta app, add `comments` and `messaging_postbacks` to the Instagram webhook
  fields.
- Request `instagram_business_manage_comments` in App Review so accounts without a
  role on the app can use it.

## Out of scope for this version

- Automatic retries of failed DMs (a later comment on the same post already retries).
- Keyword filters and per-post campaigns.
- Live video comments and Facebook Page comments.
- AI-written DMs.
