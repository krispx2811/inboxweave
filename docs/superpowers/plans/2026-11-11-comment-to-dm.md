# Comment-to-DM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When someone comments on an Instagram account that turned the feature on, reply under the comment, DM them a button, and send the owner's link once they follow, in Arabic or English to match the comment.

**Architecture:** A new `src/lib/comment-dm/` module. The decisions live in pure files (`parse`, `texts`, `templates`, `flow`) that take their database and Instagram access through a `deps` object, so they are unit-tested with fakes. Thin server-only files (`store`, `meta`, `overview`, `index`) do the real Supabase and Graph API calls. The existing Instagram webhook hands comment and button-tap events to the module inside its `after()` step. A per-channel settings page lets owners set it up.

**Tech Stack:** Next.js 16 (App Router, server actions), Supabase (Postgres, service-role client), zod, Instagram Graph API v21.0, Node 24 built-in test runner (`node --test`, type stripping).

**Spec:** `docs/superpowers/specs/2026-11-10-comment-to-dm-design.md`

---

## Read before starting

- **Pure files** must not import `server-only` and must import siblings with the `.ts` extension (e.g. `import { x } from "./types.ts"`). This is how `node --test` loads them. See `src/lib/ai/reply-prompt.ts` for the existing pattern. Type-only imports must use `import type` or inline `type` modifiers.
- **Server-only files** start with `import "server-only";` and use `@/` imports. They can't be unit-tested (importing `server-only` throws outside Next), so they are checked by `npm run typecheck`.
- Run one test file: `node --test tests/<file>.test.ts`. The run prints a `MODULE_TYPELESS_PACKAGE_JSON` warning. That's harmless and already happens today.
- `npm run lint` already reports 10 errors in files this plan doesn't touch. Don't fix them here. Lint only the files you change (Task 15 lists them).
- `src/lib/supabase/types.ts` declares `Database = any`, so new tables need no type changes.
- **Deploy order:** migration `0021` must be applied to the database **before** this code is deployed. The Channels page selects the new `granted_scopes` column.

## Deviations from the spec (decided while planning)

1. **RLS:** both new tables follow the `offers` (0019) pattern: RLS on, service role only, no client policies. The spec's "org members can select" contradicted "same pattern as offers". All reads go through the server anyway.
2. **`comment_id` is not unique.** Only `(channel_id, media_id, commenter_id)` is unique. A second unique constraint could raise errors while a failed row is being re-claimed.
3. **The link is validated with a pure https check** (`isHttpsUrl`), not `assertPublicHttpsUrl`. We send the link to Instagram and never fetch it, so the DNS-based SSRF check doesn't apply.
4. **The normal Connect button keeps comment access once an org has it.** If any Instagram channel in the org already granted comment access, the Channels page asks for it again on reconnect. Otherwise, reconnecting after a password change would silently switch Comment to DM off.
5. **When a tap finds no link** it returns the outcome `no_link` (the event status is still `failed`, as in the spec).
6. **The private DM is sent before the public reply**, and the public reply only goes out if the DM did. Its "sent you a DM" text is then always true, and a failed DM can't loop public replies.
7. **`dm_sent` and `recipientId` are saved right after Meta accepts the DM.** The inbox copy (conversation and message) is best-effort and only adds an `inbox: ...` note to the event's error. The same goes for the tap's link message: the event is updated first, then the outgoing message is logged best-effort.
8. **Stored errors are clipped to 300 code points** (not UTF-16 units), prefixes included, so emoji are never split.

## File structure

| File | New/changed | Responsibility |
|---|---|---|
| `scripts/verify-comment-dm.mjs` | new | Manual Graph API checks against a real test account (Task 1) |
| `src/lib/channels/language.ts` | new, pure | `containsArabic`, shared by commands.ts and comment-dm |
| `src/lib/channels/commands.ts` | changed | Re-exports `containsArabic` from language.ts |
| `src/lib/comment-dm/types.ts` | new, pure | All shared types and the `deps` interfaces |
| `src/lib/comment-dm/parse.ts` | new, pure | Read comment and tap events from a webhook body; button payloads |
| `src/lib/comment-dm/texts.ts` | new, pure | Default texts, language picking, settings form schema |
| `src/lib/comment-dm/templates.ts` | new, pure | Instagram button-template message bodies |
| `src/lib/comment-dm/flow.ts` | new, pure | `handleComment`, `handleTap`: every decision |
| `src/lib/comment-dm/store.ts` | new, server | Supabase implementation of `CommentDmStore` |
| `src/lib/comment-dm/meta.ts` | new, server | Graph API implementation of `CommentDmMeta` |
| `src/lib/comment-dm/overview.ts` | new, server | Counts and recent failures for the settings page |
| `src/lib/comment-dm/index.ts` | new, server | `processCommentEvents`, `processTapEvents` (real deps) |
| `src/lib/channels/ig-scopes.ts` | new, pure | Scope parsing, webhook fields, Instagram login URL, app id |
| `supabase/migrations/0021_comment_dm.sql` | new | `granted_scopes`, two tables, `claim_comment_dm()` |
| `src/app/api/webhooks/instagram/route.ts` | changed | Parse and dispatch comment and tap events |
| `src/lib/auth/oauth-state.ts` | changed | `withComments`, `returnTo` on the state |
| `src/app/api/meta/ig-oauth/callback/route.ts` | changed | Save granted scopes, subscribe fields, redirect |
| `src/app/app/[orgId]/channels/subscribe-ig/route.ts` | changed | Subscribe fields from stored scopes |
| `src/app/app/[orgId]/channels/page.tsx` | changed | Login URL helper; Comment to DM row on Instagram cards |
| `src/app/app/[orgId]/channels/comment-dm/[channelId]/page.tsx` | new | Settings page |
| `src/app/app/[orgId]/channels/comment-dm/[channelId]/TextFields.tsx` | new | English/Arabic text inputs |
| `src/app/app/[orgId]/channels/comment-dm/[channelId]/actions.ts` | new | Save settings, turn on/off |
| `tests/language.test.ts` | new | |
| `tests/comment-dm-parse.test.ts` | new | |
| `tests/comment-dm-texts.test.ts` | new | |
| `tests/comment-dm-templates.test.ts` | new | |
| `tests/ig-scopes.test.ts` | new | |
| `tests/helpers/comment-dm-fakes.ts` | new | In-memory fakes for the flow tests |
| `tests/comment-dm-comment.test.ts` | new | `handleComment` |
| `tests/comment-dm-tap.test.ts` | new | `handleTap` |

Keep test files directly in `tests/`. Only the helper goes in `tests/helpers/`, and its name must not end in `.test.ts`.

---

### Task 1: Check Meta's API on a real test account (needs the user)

The results decide two switches in Task 10: the template style, and whether the follow check is usable at all. Tasks 2–9 don't depend on the results, so building can continue while the user runs the checks.

**Files:**
- Create: `scripts/verify-comment-dm.mjs`
- Modify: `docs/superpowers/specs/2026-11-10-comment-to-dm-design.md` (append results)

- [ ] **Step 1: Write the script**

```js
/**
 * Manual checks for Comment-to-DM against a real Instagram test account.
 * Nothing here runs in production.
 *
 * Token: Meta dashboard → your app → Use cases → Instagram → API setup with
 * Instagram login → Generate token for a tester account. The use case must
 * include the instagram_business_manage_comments permission.
 *
 *   export IG_TOKEN=IGAA...
 *   node scripts/verify-comment-dm.mjs me
 *   node scripts/verify-comment-dm.mjs subscribe
 *   node scripts/verify-comment-dm.mjs comments
 *   node scripts/verify-comment-dm.mjs public-reply <commentId> [body|query]
 *   node scripts/verify-comment-dm.mjs private-reply <commentId> [button|generic]
 *   node scripts/verify-comment-dm.mjs follow <igsid>
 *   node scripts/verify-comment-dm.mjs link <igsid> <https-url>
 */

const GRAPH = "https://graph.instagram.com/v21.0";
const token = process.env.IG_TOKEN;
if (!token) {
  console.error("Set IG_TOKEN first (see the comment at the top of this file).");
  process.exit(1);
}

async function call(method, path, { query = {}, body, tokenIn = method === "GET" ? "query" : "body" } = {}) {
  const url = new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  if (tokenIn === "query") url.searchParams.set("access_token", token);
  const init = { method };
  if (method !== "GET") {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(tokenIn === "body" ? { ...body, access_token: token } : (body ?? {}));
  }
  const res = await fetch(url, init);
  const text = await res.text();
  console.log(`${method} ${path} → ${res.status}`);
  console.log(text);
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function template(style, text, button) {
  if (style === "generic") {
    return { attachment: { type: "template", payload: { template_type: "generic", elements: [{ title: text.slice(0, 80), buttons: [button] }] } } };
  }
  return { attachment: { type: "template", payload: { template_type: "button", text, buttons: [button] } } };
}

const [cmd, a, b] = process.argv.slice(2);
switch (cmd) {
  case "me":
    await call("GET", "me", { query: { fields: "user_id,username" } });
    break;
  case "subscribe": {
    const me = await call("GET", "me", { query: { fields: "user_id" } });
    await call("POST", `${me.user_id}/subscribed_apps`, {
      query: { subscribed_fields: "messages,comments,messaging_postbacks" },
      tokenIn: "query",
    });
    break;
  }
  case "comments": {
    const media = await call("GET", "me/media", { query: { fields: "id,caption,media_product_type,timestamp", limit: "3" } });
    for (const m of media.data ?? []) {
      await call("GET", `${m.id}/comments`, { query: { fields: "id,text,from,timestamp", limit: "5" } });
    }
    break;
  }
  case "public-reply":
    await call("POST", `${a}/replies`, { body: { message: "Sent you a DM 📩 (test)" }, tokenIn: b === "query" ? "query" : "body" });
    break;
  case "private-reply":
    await call("POST", "me/messages", {
      body: {
        recipient: { comment_id: a },
        message: template(b ?? "button", "Test: tap the button below.", {
          type: "postback",
          title: "Send me the link",
          payload: "cdm:00000000-0000-4000-8000-000000000000",
        }),
      },
    });
    break;
  case "follow":
    await call("GET", a, { query: { fields: "is_user_follow_business,username" } });
    break;
  case "link":
    await call("POST", "me/messages", {
      body: { recipient: { id: a }, message: template("button", "Here's your link 🎉 (test)", { type: "web_url", title: "Open link", url: b }) },
    });
    break;
  default:
    console.log("Commands: me, subscribe, comments, public-reply, private-reply, follow, link");
}
```

- [ ] **Step 2: Check the script runs**

Run: `node scripts/verify-comment-dm.mjs`
Expected: `Set IG_TOKEN first (see the comment at the top of this file).` and exit code 1.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-comment-dm.mjs
git commit -m "Add a script to check Instagram's comment and button APIs by hand" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: The user runs the checks** (stop and ask the user; this needs their Meta app and two Instagram accounts)

1. In the Meta app, add the `comments` and `messaging_postbacks` webhook fields, add `instagram_business_manage_comments` to the Instagram use case, and generate a token for the test account.
2. `node scripts/verify-comment-dm.mjs subscribe` → expect `{"success":true}`.
3. From a second Instagram account, comment on a post of the test account. Run `node scripts/verify-comment-dm.mjs comments` and note the comment id. Also note whether a comment the test account itself posts has `from.id` equal to the account id (the `17841...` id): the own-comment check relies on it. In InboxWeave, **Settings → Debug** shows the raw comment webhook. Compare it with the spec's expected payload.
4. `public-reply <commentId>` → the reply shows under the comment. If it fails, try `public-reply <commentId> query`.
5. `private-reply <commentId>` → a DM with a button arrives on the second account. Also note whether the response includes `recipient_id`: the flow falls back to the commenter's id when it doesn't. If Meta rejects the template, comment again and run `private-reply <newCommentId> generic` (Meta allows one private reply per comment).
6. Tap the button on the second account. **Settings → Debug** shows the raw tap webhook. Note `sender.id` (the IGSID) and compare the shape with the spec.
7. `follow <igsid>` while the second account doesn't follow, then again after it follows. Expect `is_user_follow_business` to be `false`, then `true`.
8. `link <igsid> https://example.com` → a DM with an **Open link** button.

- [ ] **Step 5: Record the results in the spec and commit**

Append this section to the end of `docs/superpowers/specs/2026-11-10-comment-to-dm-design.md`, filled in:

```markdown
## Verification results (<date>)

| Check | Result |
|---|---|
| Button template in a private reply | works / rejected with "<error>" → use generic |
| Public reply, token in JSON body | works / needs the token in the query |
| `is_user_follow_business` after a tap | false then true / missing |
| Comment webhook payload | matches / differs: <paste> |
| Tap webhook payload | matches / differs: <paste> |
```

```bash
git add docs/superpowers/specs/2026-11-10-comment-to-dm-design.md
git commit -m "Record what Instagram's API does for comment DMs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**If `is_user_follow_business` is missing**, stop and tell the user. The follow gate can't work, and the flow would send everyone the link (it fails open). That needs a design decision before Task 10.

---

### Task 2: Shared Arabic detection

**Files:**
- Create: `src/lib/channels/language.ts`
- Modify: `src/lib/channels/commands.ts:1` and `src/lib/channels/commands.ts:49-52`
- Test: `tests/language.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/language.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { containsArabic } from "../src/lib/channels/language.ts";

test("detects Arabic letters anywhere in the text", () => {
  assert.equal(containsArabic("مرحبا"), true);
  assert.equal(containsArabic("price? كم"), true);
});

test("is false for Latin, emoji and empty input", () => {
  assert.equal(containsArabic("hello"), false);
  assert.equal(containsArabic("🔥🔥"), false);
  assert.equal(containsArabic(""), false);
  assert.equal(containsArabic(null), false);
  assert.equal(containsArabic(undefined), false);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test tests/language.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/lib/channels/language.ts`.

- [ ] **Step 3: Write the module**

`src/lib/channels/language.ts`:

```ts
/**
 * Arabic-script detection. Pure (no "server-only") so pure modules and unit
 * tests can share it; commands.ts re-exports it for existing callers.
 */
export function containsArabic(text: string | null | undefined): boolean {
  if (!text) return false;
  return /[؀-ۿ]/.test(text);
}
```

- [ ] **Step 4: Point commands.ts at it**

In `src/lib/channels/commands.ts`, replace line 1:

```ts
import "server-only";
```

with:

```ts
import "server-only";
import { containsArabic } from "./language";
```

and replace:

```ts
export function containsArabic(text: string | null | undefined): boolean {
  if (!text) return false;
  return /[؀-ۿ]/.test(text);
}
```

with:

```ts
export { containsArabic };
```

(`[؀-ۿ]` is U+0600–U+06FF, the same range.)

- [ ] **Step 5: Run the tests and typecheck**

Run: `node --test tests/language.test.ts && npm run typecheck`
Expected: 2 tests pass; typecheck prints no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/channels/language.ts src/lib/channels/commands.ts tests/language.test.ts
git commit -m "Move Arabic detection into a pure module so it can be shared" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Types and webhook parsing

**Files:**
- Create: `src/lib/comment-dm/types.ts`, `src/lib/comment-dm/parse.ts`
- Test: `tests/comment-dm-parse.test.ts`

- [ ] **Step 1: Write the types**

`src/lib/comment-dm/types.ts`:

```ts
/**
 * Shared types for Comment-to-DM. Pure: no imports, so unit tests and server
 * code can both use it.
 */

export type Lang = "en" | "ar";

export const TEXT_KEYS = [
  "publicReply",
  "opening",
  "openingButton",
  "followFirst",
  "followedButton",
  "linkMessage",
  "linkButton",
] as const;
export type TextKey = (typeof TEXT_KEYS)[number];
export type Texts = Record<TextKey, string>;
/** What the owner saved: only the texts they changed, per language. */
export type SavedTexts = Partial<Record<Lang, Partial<Texts>>>;

export interface CommentDmSettings {
  channelId: string;
  orgId: string;
  enabled: boolean;
  linkUrl: string | null;
  defaultLanguage: Lang;
  requireFollow: boolean;
  publicReplyEnabled: boolean;
  texts: SavedTexts;
}

/** A new comment, from a `comments` webhook change. */
export interface CommentEvent {
  /** entry.id: the Instagram account the comment was left on. */
  accountId: string;
  commentId: string;
  mediaId: string;
  commenterId: string;
  commenterUsername?: string;
  text: string;
}

/** A button tap, from a `messaging_postbacks` webhook event. */
export interface TapEvent {
  accountId: string;
  /** IGSID of the person who tapped. */
  senderId: string;
  mid: string;
  title: string;
  payload: string;
}

export type EventStatus = "pending" | "dm_sent" | "awaiting_follow" | "link_sent" | "failed";

/** One row of comment_dm_events: one person, one post. */
export interface DmEvent {
  id: string;
  orgId: string;
  channelId: string;
  mediaId: string;
  commenterId: string;
  commenterUsername: string | null;
  commentId: string;
  recipientId: string | null;
  conversationId: string | null;
  language: Lang;
  status: EventStatus;
  tapCount: number;
  error: string | null;
}

export type EventPatch = Partial<
  Pick<DmEvent, "status" | "recipientId" | "conversationId" | "tapCount" | "error">
>;

export interface ClaimInput {
  orgId: string;
  channelId: string;
  mediaId: string;
  commenterId: string;
  commenterUsername: string | null;
  commentId: string;
  commentText: string;
  language: Lang;
}

export interface ChannelInfo {
  id: string;
  orgId: string;
  externalId: string;
  /** The account's @username (channels.display_name), when known. */
  username: string | null;
  status: string;
}

export type Button =
  | { type: "postback"; title: string; payload: string }
  | { type: "web_url"; title: string; url: string };

export interface ButtonMessage {
  text: string;
  button: Button;
}

export interface SendResult {
  messageId?: string;
  recipientId?: string;
}

export type FollowResult = { ok: true; follows: boolean } | { ok: false; error: string };

export interface InboxMessage {
  orgId: string;
  conversationId: string;
  direction: "in" | "out";
  sender: "contact" | "ai";
  content: string;
  platformMessageId: string | null;
}

export interface ConversationInput {
  orgId: string;
  channelId: string;
  contactExternalId: string;
  contactUsername: string | null;
  language: Lang;
}

/** Database access the flow needs. Real one: store.ts. Tests pass a fake. */
export interface CommentDmStore {
  getChannelByExternalId(externalId: string): Promise<ChannelInfo | null>;
  getChannelById(id: string): Promise<ChannelInfo | null>;
  getSettings(channelId: string): Promise<CommentDmSettings | null>;
  /** Atomically claim the person+post row; null when it's already taken. */
  claimEvent(input: ClaimInput): Promise<DmEvent | null>;
  getEvent(id: string): Promise<DmEvent | null>;
  updateEvent(id: string, patch: EventPatch): Promise<void>;
  /** Upsert the inbox conversation; returns its id. */
  ensureConversation(input: ConversationInput): Promise<string>;
  /** "duplicate" when a message with the same platform id already exists. */
  logMessage(msg: InboxMessage): Promise<"inserted" | "duplicate">;
}

/** Instagram calls the flow needs. Real one: meta.ts. Tests pass a fake. */
export interface CommentDmMeta {
  replyToComment(channelId: string, commentId: string, text: string): Promise<void>;
  sendPrivateReply(channelId: string, commentId: string, msg: ButtonMessage): Promise<SendResult>;
  sendButtonMessage(channelId: string, recipientId: string, msg: ButtonMessage): Promise<SendResult>;
  checkFollows(channelId: string, igsid: string): Promise<FollowResult>;
}

export interface CommentDmDeps {
  store: CommentDmStore;
  meta: CommentDmMeta;
}
```

- [ ] **Step 2: Write the failing parse test**

`tests/comment-dm-parse.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decodePayload,
  encodePayload,
  parseCommentEvents,
  parseTapEvents,
} from "../src/lib/comment-dm/parse.ts";

const ACCOUNT = "17841400000000001";
const EVENT_ID = "0b5f8c1e-6a3d-4f7b-9c2e-1d4a5b6c7d8e";

test("reads a comment", () => {
  const body = {
    object: "instagram",
    entry: [{
      id: ACCOUNT,
      time: 1731300000,
      changes: [{
        field: "comments",
        value: {
          id: "17900000000000001",
          text: "كم السعر؟",
          from: { id: "17800000000000009", username: "sara" },
          media: { id: "18000000000000003", media_product_type: "REELS" },
        },
      }],
    }],
  };
  assert.deepEqual(parseCommentEvents(body), [{
    accountId: ACCOUNT,
    commentId: "17900000000000001",
    mediaId: "18000000000000003",
    commenterId: "17800000000000009",
    commenterUsername: "sara",
    text: "كم السعر؟",
  }]);
});

test("skips comments missing the post or the author, and other fields", () => {
  const body = {
    entry: [{
      id: ACCOUNT,
      changes: [
        { field: "comments", value: { id: "1", text: "hi", from: { id: "2" } } },
        { field: "comments", value: { id: "1", text: "hi", media: { id: "3" } } },
        { field: "messages", value: { sender: { id: "2" }, message: { text: "hi" } } },
      ],
    }],
  };
  assert.deepEqual(parseCommentEvents(body), []);
});

test("a comment with no text reads as empty text", () => {
  const body = { entry: [{ id: ACCOUNT, changes: [{ field: "comments", value: { id: "1", from: { id: "2" }, media: { id: "3" } } }] }] };
  assert.equal(parseCommentEvents(body)[0]!.text, "");
});

test("ignores bodies that aren't webhooks", () => {
  assert.deepEqual(parseCommentEvents(null), []);
  assert.deepEqual(parseCommentEvents({}), []);
  assert.deepEqual(parseTapEvents("nope"), []);
});

test("reads a button tap from entry.messaging", () => {
  const body = {
    object: "instagram",
    entry: [{
      id: ACCOUNT,
      messaging: [{
        sender: { id: "igsid-1" },
        recipient: { id: ACCOUNT },
        timestamp: 1731300000000,
        postback: { mid: "mid-1", title: "Send me the link", payload: `cdm:${EVENT_ID}` },
      }],
    }],
  };
  assert.deepEqual(parseTapEvents(body), [{
    accountId: ACCOUNT,
    senderId: "igsid-1",
    mid: "mid-1",
    title: "Send me the link",
    payload: `cdm:${EVENT_ID}`,
  }]);
});

test("reads a tap delivered as a messaging_postbacks change, without a mid", () => {
  const body = {
    entry: [{
      id: ACCOUNT,
      changes: [{
        field: "messaging_postbacks",
        value: { sender: { id: "igsid-1" }, timestamp: 5, postback: { title: "I followed ✅", payload: `cdm:${EVENT_ID}` } },
      }],
    }],
  };
  const [tap] = parseTapEvents(body);
  assert.equal(tap!.title, "I followed ✅");
  assert.equal(tap!.mid, "postback:igsid-1:5");
});

test("ordinary DMs are not taps", () => {
  const body = {
    entry: [{ id: ACCOUNT, messaging: [{ sender: { id: "igsid-1" }, recipient: { id: ACCOUNT }, message: { mid: "m", text: "hi" } }] }],
  };
  assert.deepEqual(parseTapEvents(body), []);
});

test("payloads round-trip, and only our own decode", () => {
  assert.equal(decodePayload(encodePayload(EVENT_ID)), EVENT_ID);
  assert.equal(decodePayload(`cdm:${EVENT_ID.toUpperCase()}`), EVENT_ID);
  assert.equal(decodePayload("cdm:not-a-uuid"), null);
  assert.equal(decodePayload(`other:${EVENT_ID}`), null);
  assert.equal(decodePayload(""), null);
  assert.equal(decodePayload(undefined), null);
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `node --test tests/comment-dm-parse.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/lib/comment-dm/parse.ts`.

- [ ] **Step 4: Write parse.ts**

`src/lib/comment-dm/parse.ts`:

```ts
import type { CommentEvent, TapEvent } from "./types.ts";

/**
 * Reads Comment-to-DM events out of an Instagram webhook body. Pure.
 * Comments arrive as entry.changes[{ field: "comments" }]. Button taps arrive
 * as entry.messaging[].postback, or on newer payloads as
 * entry.changes[{ field: "messaging_postbacks" }].
 */

const PAYLOAD_PREFIX = "cdm:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodePayload(eventId: string): string {
  return `${PAYLOAD_PREFIX}${eventId}`;
}

/** The event id inside one of our button payloads, or null for anything else. */
export function decodePayload(payload: string | null | undefined): string | null {
  if (!payload || !payload.startsWith(PAYLOAD_PREFIX)) return null;
  const id = payload.slice(PAYLOAD_PREFIX.length);
  return UUID.test(id) ? id.toLowerCase() : null;
}

interface RawComment {
  id?: string | number;
  text?: unknown;
  from?: { id?: string | number; username?: string };
  media?: { id?: string | number };
}

interface RawMessaging {
  sender?: { id?: string | number };
  timestamp?: number;
  postback?: { mid?: string; title?: string; payload?: string };
}

interface RawEntry {
  id?: string | number;
  changes?: Array<{ field?: string; value?: unknown }>;
  messaging?: RawMessaging[];
  standby?: RawMessaging[];
}

function entriesOf(body: unknown): RawEntry[] {
  const entry = (body as { entry?: unknown } | null)?.entry;
  return Array.isArray(entry) ? (entry as RawEntry[]) : [];
}

export function parseCommentEvents(body: unknown): CommentEvent[] {
  const out: CommentEvent[] = [];
  for (const entry of entriesOf(body)) {
    if (entry.id == null) continue;
    for (const change of entry.changes ?? []) {
      if (change.field !== "comments" || !change.value) continue;
      const v = change.value as RawComment;
      if (v.id == null || v.from?.id == null || v.media?.id == null) continue;
      out.push({
        accountId: String(entry.id),
        commentId: String(v.id),
        mediaId: String(v.media.id),
        commenterId: String(v.from.id),
        commenterUsername: v.from.username,
        text: typeof v.text === "string" ? v.text : "",
      });
    }
  }
  return out;
}

export function parseTapEvents(body: unknown): TapEvent[] {
  const out: TapEvent[] = [];
  for (const entry of entriesOf(body)) {
    if (entry.id == null) continue;
    const events: RawMessaging[] = [...(entry.messaging ?? []), ...(entry.standby ?? [])];
    for (const change of entry.changes ?? []) {
      if (change.field === "messaging_postbacks" && change.value) events.push(change.value as RawMessaging);
    }
    for (const ev of events) {
      const postback = ev.postback;
      if (!postback?.payload || ev.sender?.id == null) continue;
      const senderId = String(ev.sender.id);
      out.push({
        accountId: String(entry.id),
        senderId,
        mid: postback.mid ?? `postback:${senderId}:${ev.timestamp ?? ""}`,
        title: postback.title ?? "",
        payload: postback.payload,
      });
    }
  }
  return out;
}
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `node --test tests/comment-dm-parse.test.ts && npm run typecheck`
Expected: 8 tests pass; no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/comment-dm/types.ts src/lib/comment-dm/parse.ts tests/comment-dm-parse.test.ts
git commit -m "Read comments and button taps out of Instagram webhooks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Texts, language and the settings form

**Files:**
- Create: `src/lib/comment-dm/texts.ts`
- Test: `tests/comment-dm-texts.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/comment-dm-texts.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_TEXTS,
  TEXT_LIMITS,
  compactTexts,
  isHttpsUrl,
  parseSettingsForm,
  pickLanguage,
  resolveTexts,
  textFieldName,
} from "../src/lib/comment-dm/texts.ts";
import { TEXT_KEYS } from "../src/lib/comment-dm/types.ts";

test("Arabic comments get Arabic", () => {
  assert.equal(pickLanguage("كم السعر؟", "en"), "ar");
  assert.equal(pickLanguage("price please كم", "en"), "ar");
});

test("comments with other letters get English", () => {
  assert.equal(pickLanguage("I want it!", "ar"), "en");
  assert.equal(pickLanguage("je veux", "ar"), "en");
});

test("comments with no words use the account's default", () => {
  assert.equal(pickLanguage("🔥🔥", "ar"), "ar");
  assert.equal(pickLanguage("@sara.k_1 🔥", "ar"), "ar");
  assert.equal(pickLanguage("123 !!", "en"), "en");
  assert.equal(pickLanguage("", "ar"), "ar");
});

test("an @tag doesn't decide the language", () => {
  assert.equal(pickLanguage("@ahmed مرحبا", "en"), "ar");
});

test("default texts exist and fit Meta's limits in both languages", () => {
  for (const lang of ["en", "ar"] as const) {
    for (const key of TEXT_KEYS) {
      const text = DEFAULT_TEXTS[lang][key];
      assert.ok(text.length > 0, `${lang}.${key} is empty`);
      assert.ok(text.length <= TEXT_LIMITS[key], `${lang}.${key} is too long`);
    }
  }
});

test("the owner's texts win, and empty ones fall back to the defaults", () => {
  const texts = resolveTexts({ ar: { opening: "  هلا!  ", linkButton: "" } }, "ar");
  assert.equal(texts.opening, "هلا!");
  assert.equal(texts.linkButton, DEFAULT_TEXTS.ar.linkButton);
  assert.deepEqual(resolveTexts(null, "en"), DEFAULT_TEXTS.en);
});

test("only texts that differ from the defaults are kept", () => {
  assert.deepEqual(
    compactTexts({ en: { opening: DEFAULT_TEXTS.en.opening, linkMessage: "Your trial 🎉", linkButton: " " }, ar: {} }),
    { en: { linkMessage: "Your trial 🎉" } },
  );
});

test("links must be https", () => {
  assert.equal(isHttpsUrl("https://inboxweave.com/trial"), true);
  assert.equal(isHttpsUrl("http://inboxweave.com"), false);
  assert.equal(isHttpsUrl("javascript:alert(1)"), false);
  assert.equal(isHttpsUrl("https://user:pw@example.com"), false);
  assert.equal(isHttpsUrl("not a url"), false);
});

function form(values: Record<string, string>) {
  return (name: string) => values[name] ?? null;
}

test("reads the settings form", () => {
  const result = parseSettingsForm(form({
    linkUrl: " https://inboxweave.com/trial ",
    defaultLanguage: "ar",
    requireFollow: "on",
    [textFieldName("en", "linkMessage")]: "Your trial 🎉",
  }));
  assert.ok(result.success);
  assert.equal(result.data.linkUrl, "https://inboxweave.com/trial");
  assert.equal(result.data.defaultLanguage, "ar");
  assert.equal(result.data.requireFollow, true);
  assert.equal(result.data.publicReplyEnabled, false);
  assert.equal(result.data.texts.en.linkMessage, "Your trial 🎉");
});

test("an empty link is allowed while the feature is off", () => {
  assert.ok(parseSettingsForm(form({ linkUrl: "", defaultLanguage: "en" })).success);
});

test("rejects http links and long button labels with a readable message", () => {
  const http = parseSettingsForm(form({ linkUrl: "http://x.com", defaultLanguage: "en" }));
  assert.equal(http.success, false);
  assert.match(http.error!.issues[0]!.message, /https/);

  const long = parseSettingsForm(form({
    linkUrl: "",
    defaultLanguage: "en",
    [textFieldName("ar", "openingButton")]: "أ".repeat(21),
  }));
  assert.equal(long.success, false);
  assert.match(long.error!.issues[0]!.message, /First DM button \(Arabic\) can be at most 20 characters/);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test tests/comment-dm-texts.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/lib/comment-dm/texts.ts`.

- [ ] **Step 3: Write texts.ts**

`src/lib/comment-dm/texts.ts`:

```ts
import { z } from "zod";
import { containsArabic } from "../channels/language.ts";
import { TEXT_KEYS, type Lang, type SavedTexts, type TextKey, type Texts } from "./types.ts";

/** Default texts, used for any field the owner leaves empty. */
export const DEFAULT_TEXTS: Record<Lang, Texts> = {
  en: {
    publicReply: "Sent you a DM 📩",
    opening: "Hey! Thanks for your comment 🙌 Tap the button below and I'll send you the link.",
    openingButton: "Send me the link",
    followFirst:
      "Almost there! Follow our account first, then tap the button below and I'll send you the link right away.",
    followedButton: "I followed ✅",
    linkMessage: "Here's your link 🎉",
    linkButton: "Open link",
  },
  ar: {
    publicReply: "أرسلنا لك رسالة على الخاص 📩",
    opening: "أهلاً! شكراً على تعليقك 🙌 اضغط الزر تحت ونرسل لك الرابط.",
    openingButton: "أرسل لي الرابط",
    followFirst: "باقي خطوة! تابع حسابنا أولاً، بعدها اضغط الزر تحت ونرسل لك الرابط مباشرة.",
    followedButton: "تابعت ✅",
    linkMessage: "تفضل الرابط 🎉",
    linkButton: "افتح الرابط",
  },
};

/** Meta's limits: button labels 20, template text 640. Public replies kept short. */
export const TEXT_LIMITS: Record<TextKey, number> = {
  publicReply: 300,
  opening: 640,
  openingButton: 20,
  followFirst: 640,
  followedButton: 20,
  linkMessage: 640,
  linkButton: 20,
};

export const TEXT_LABELS: Record<TextKey, string> = {
  publicReply: "Public reply under the comment",
  opening: "First DM",
  openingButton: "First DM button",
  followFirst: "Message when they don't follow yet",
  followedButton: "\"I followed\" button",
  linkMessage: "Message with the link",
  linkButton: "Link button",
};

export const LANG_NAMES: Record<Lang, string> = { en: "English", ar: "Arabic" };

/**
 * The language to answer a comment in: Arabic letters → ar, any other
 * letters → en, no letters at all (emoji, numbers, @tags) → the default.
 */
export function pickLanguage(commentText: string, fallback: Lang): Lang {
  const words = commentText.replace(/@[A-Za-z0-9._]+/g, " ");
  if (containsArabic(words)) return "ar";
  if (/\p{L}/u.test(words)) return "en";
  return fallback;
}

/** The texts to send in `lang`: the owner's non-empty texts over the defaults. */
export function resolveTexts(saved: SavedTexts | null | undefined, lang: Lang): Texts {
  const out: Texts = { ...DEFAULT_TEXTS[lang] };
  const custom = saved?.[lang] ?? {};
  for (const key of TEXT_KEYS) {
    const value = custom[key]?.trim();
    if (value) out[key] = value;
  }
  return out;
}

/**
 * Keep only texts that differ from the defaults, so a later change to a
 * default still reaches owners who never edited that text.
 */
export function compactTexts(texts: SavedTexts): SavedTexts {
  const out: SavedTexts = {};
  for (const lang of ["en", "ar"] as const) {
    const kept: Partial<Texts> = {};
    for (const key of TEXT_KEYS) {
      const value = texts[lang]?.[key]?.trim();
      if (value && value !== DEFAULT_TEXTS[lang][key]) kept[key] = value;
    }
    if (Object.keys(kept).length > 0) out[lang] = kept;
  }
  return out;
}

/** https, with a host and no credentials. We send the link to Instagram; we never fetch it. */
export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.length > 0 && !url.username && !url.password;
  } catch {
    return false;
  }
}

function textField(key: TextKey, lang: Lang) {
  const limit = TEXT_LIMITS[key];
  return z
    .string()
    .trim()
    .max(limit, `${TEXT_LABELS[key]} (${LANG_NAMES[lang]}) can be at most ${limit} characters`);
}

function langTextsSchema(lang: Lang) {
  return z
    .object({
      publicReply: textField("publicReply", lang),
      opening: textField("opening", lang),
      openingButton: textField("openingButton", lang),
      followFirst: textField("followFirst", lang),
      followedButton: textField("followedButton", lang),
      linkMessage: textField("linkMessage", lang),
      linkButton: textField("linkButton", lang),
    })
    .partial();
}

export const SettingsFormSchema = z.object({
  linkUrl: z
    .string()
    .trim()
    .max(2000, "The link is too long")
    .refine((v) => v === "" || isHttpsUrl(v), "The link must start with https://"),
  defaultLanguage: z.enum(["en", "ar"]),
  requireFollow: z.boolean(),
  publicReplyEnabled: z.boolean(),
  texts: z.object({ en: langTextsSchema("en"), ar: langTextsSchema("ar") }),
});
export type SettingsForm = z.infer<typeof SettingsFormSchema>;

/** Name of one text input on the settings form, e.g. "ar.opening". */
export function textFieldName(lang: Lang, key: TextKey): string {
  return `${lang}.${key}`;
}

/** Parse the settings form. `get` is FormData.get, or a fake in tests. */
export function parseSettingsForm(get: (name: string) => unknown) {
  const str = (name: string) => {
    const v = get(name);
    return typeof v === "string" ? v : "";
  };
  const textsFor = (lang: Lang) =>
    Object.fromEntries(TEXT_KEYS.map((key) => [key, str(textFieldName(lang, key))]));
  return SettingsFormSchema.safeParse({
    linkUrl: str("linkUrl"),
    defaultLanguage: str("defaultLanguage"),
    requireFollow: get("requireFollow") === "on",
    publicReplyEnabled: get("publicReplyEnabled") === "on",
    texts: { en: textsFor("en"), ar: textsFor("ar") },
  });
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `node --test tests/comment-dm-texts.test.ts && npm run typecheck`
Expected: 11 tests pass; no type errors.

- [ ] **Step 5: Review the Arabic defaults**

Invoke the `ux-writing-arabic` skill on the 7 Arabic strings in `DEFAULT_TEXTS.ar`. They should read naturally to a Gulf audience and stay friendly and short. If it suggests changes, apply them to `texts.ts` and to the "Default texts" table in the spec. Rerun `node --test tests/comment-dm-texts.test.ts`. The limits test catches any button label over 20 characters.

- [ ] **Step 6: Commit**

```bash
git add src/lib/comment-dm/texts.ts tests/comment-dm-texts.test.ts docs/superpowers/specs/2026-11-10-comment-to-dm-design.md
git commit -m "Add Comment-to-DM texts, language picking and the settings form schema" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Instagram scopes and the login URL

**Files:**
- Create: `src/lib/channels/ig-scopes.ts`
- Test: `tests/ig-scopes.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/ig-scopes.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildIgLoginUrl,
  hasCommentAccess,
  igSubscribedFields,
  parseGrantedScopes,
  pickIgAppId,
  requestedIgScopes,
} from "../src/lib/channels/ig-scopes.ts";

test("reads granted scopes as an array or a comma-separated string", () => {
  assert.deepEqual(
    parseGrantedScopes(["instagram_business_basic", "instagram_business_manage_comments"]),
    ["instagram_business_basic", "instagram_business_manage_comments"],
  );
  assert.deepEqual(
    parseGrantedScopes("instagram_business_basic, instagram_business_manage_messages,"),
    ["instagram_business_basic", "instagram_business_manage_messages"],
  );
  assert.equal(parseGrantedScopes(""), null);
  assert.equal(parseGrantedScopes(undefined), null);
  assert.equal(parseGrantedScopes(42), null);
});

test("comment access needs the comments scope", () => {
  assert.equal(hasCommentAccess(["instagram_business_manage_comments"]), true);
  assert.equal(hasCommentAccess(["instagram_business_basic"]), false);
  assert.equal(hasCommentAccess(null), false);
});

test("subscribes to comment fields only with comment access", () => {
  assert.equal(igSubscribedFields(requestedIgScopes(false)), "messages");
  assert.equal(igSubscribedFields(requestedIgScopes(true)), "messages,comments,messaging_postbacks");
  assert.equal(igSubscribedFields(null), "messages");
});

test("the normal login URL is exactly what the Channels page built before", () => {
  const before =
    `https://www.instagram.com/oauth/authorize?` +
    new URLSearchParams({
      enable_fb_login: "0",
      force_authentication: "1",
      client_id: "123",
      redirect_uri: "https://inboxweave.com/api/meta/oauth/callback",
      response_type: "code",
      scope: "instagram_business_basic,instagram_business_manage_messages",
      state: "st",
    }).toString();
  assert.equal(buildIgLoginUrl({ appId: "123", appUrl: "https://inboxweave.com", state: "st" }), before);
});

test("the comment-access login URL also asks for comments", () => {
  const url = new URL(buildIgLoginUrl({ appId: "123", appUrl: "https://inboxweave.com", state: "st", withComments: true }));
  assert.equal(
    url.searchParams.get("scope"),
    "instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments",
  );
});

test("picks the org's Instagram app, then its legacy app, then the platform's", () => {
  assert.equal(pickIgAppId({ ig_app_id: "ig", app_id: "legacy" }, "env"), "ig");
  assert.equal(pickIgAppId({ ig_app_id: null, app_id: "legacy" }, "env"), "legacy");
  assert.equal(pickIgAppId(null, "env"), "env");
  assert.equal(pickIgAppId({ ig_app_id: null, app_id: null }, undefined), undefined);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test tests/ig-scopes.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/lib/channels/ig-scopes.ts`.

- [ ] **Step 3: Write ig-scopes.ts**

`src/lib/channels/ig-scopes.ts`:

```ts
/**
 * Instagram Business Login scopes and the webhook fields they unlock. Pure.
 */

export const IG_BASE_SCOPES = ["instagram_business_basic", "instagram_business_manage_messages"] as const;
export const IG_COMMENTS_SCOPE = "instagram_business_manage_comments";

/** The scopes we ask for. Comment access only when Comment to DM needs it. */
export function requestedIgScopes(withComments: boolean): string[] {
  return withComments ? [...IG_BASE_SCOPES, IG_COMMENTS_SCOPE] : [...IG_BASE_SCOPES];
}

/** Meta's `permissions` from the token exchange: an array or a comma-separated string. */
export function parseGrantedScopes(raw: unknown): string[] | null {
  const list = Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? raw.split(",") : [];
  const scopes = [...new Set(list.map((s) => s.trim()).filter(Boolean))];
  return scopes.length > 0 ? scopes : null;
}

export function hasCommentAccess(scopes: readonly string[] | null | undefined): boolean {
  return !!scopes && scopes.includes(IG_COMMENTS_SCOPE);
}

/** Webhook fields to subscribe an account to. Comment fields need comment access. */
export function igSubscribedFields(scopes: readonly string[] | null | undefined): string {
  return hasCommentAccess(scopes) ? "messages,comments,messaging_postbacks" : "messages";
}

export function buildIgLoginUrl(params: {
  appId: string;
  appUrl: string;
  state: string;
  withComments?: boolean;
}): string {
  return (
    "https://www.instagram.com/oauth/authorize?" +
    new URLSearchParams({
      enable_fb_login: "0",
      force_authentication: "1",
      client_id: params.appId,
      redirect_uri: `${params.appUrl}/api/meta/oauth/callback`,
      response_type: "code",
      scope: requestedIgScopes(params.withComments ?? false).join(","),
      state: params.state,
    }).toString()
  );
}

/** The Instagram app id for an org: its own IG app, its legacy app, or the platform's. */
export function pickIgAppId(
  row: { ig_app_id?: unknown; app_id?: unknown } | null | undefined,
  fallback: string | undefined,
): string | undefined {
  const own = (row?.ig_app_id as string | null | undefined) ?? (row?.app_id as string | null | undefined);
  return own ?? fallback;
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `node --test tests/ig-scopes.test.ts && npm run typecheck`
Expected: 6 tests pass; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/channels/ig-scopes.ts tests/ig-scopes.test.ts
git commit -m "Add helpers for Instagram scopes, webhook fields and the login URL" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The comment flow

**Files:**
- Create: `src/lib/comment-dm/flow.ts`, `tests/helpers/comment-dm-fakes.ts`
- Test: `tests/comment-dm-comment.test.ts`

- [ ] **Step 1: Write the fakes**

`tests/helpers/comment-dm-fakes.ts`:

```ts
import type {
  ButtonMessage,
  ChannelInfo,
  CommentDmDeps,
  CommentDmSettings,
  CommentEvent,
  DmEvent,
  FollowResult,
  InboxMessage,
  TapEvent,
} from "../../src/lib/comment-dm/types.ts";

export const ACCOUNT_ID = "17841400000000001";

export interface SentCall {
  kind: "public" | "private" | "dm";
  target: string;
  text?: string;
  msg?: ButtonMessage;
}

export interface FakeOptions {
  channel?: Partial<ChannelInfo>;
  settings?: Partial<CommentDmSettings> | null;
  follow?: FollowResult;
  publicReplyError?: string;
  privateReplyError?: string;
  dmError?: string;
  /** What Meta returns as recipient_id after the private reply; null = nothing. */
  recipientId?: string | null;
}

/** In-memory store and Instagram fakes for the Comment-to-DM flow. */
export function makeFakes(opts: FakeOptions = {}) {
  const channel: ChannelInfo = {
    id: "ch-1",
    orgId: "org-1",
    externalId: ACCOUNT_ID,
    username: "shop",
    status: "active",
    ...opts.channel,
  };
  const baseSettings: CommentDmSettings = {
    channelId: "ch-1",
    orgId: "org-1",
    enabled: true,
    linkUrl: "https://example.com/trial",
    defaultLanguage: "en",
    requireFollow: true,
    publicReplyEnabled: true,
    texts: {},
  };
  // Mutable so a test can change things between calls.
  const state: { settings: CommentDmSettings | null; follow: FollowResult; privateReplyError?: string } = {
    settings: opts.settings === null ? null : { ...baseSettings, ...opts.settings },
    follow: opts.follow ?? { ok: true, follows: true },
    privateReplyError: opts.privateReplyError,
  };
  const events = new Map<string, DmEvent>();
  const messages: InboxMessage[] = [];
  const sent: SentCall[] = [];
  let followChecks = 0;
  let nextEventId = 1;
  let nextMid = 1;

  const deps: CommentDmDeps = {
    store: {
      async getChannelByExternalId(externalId) {
        return externalId === channel.externalId ? channel : null;
      },
      async getChannelById(id) {
        return id === channel.id ? channel : null;
      },
      async getSettings() {
        return state.settings;
      },
      async claimEvent(input) {
        const existing = [...events.values()].find(
          (e) => e.channelId === input.channelId && e.mediaId === input.mediaId && e.commenterId === input.commenterId,
        );
        if (existing && existing.status !== "failed") return null;
        const event: DmEvent = existing
          ? { ...existing, commentId: input.commentId, language: input.language, status: "pending", error: null }
          : {
              id: `00000000-0000-4000-8000-${String(nextEventId++).padStart(12, "0")}`,
              orgId: input.orgId,
              channelId: input.channelId,
              mediaId: input.mediaId,
              commenterId: input.commenterId,
              commenterUsername: input.commenterUsername,
              commentId: input.commentId,
              recipientId: null,
              conversationId: null,
              language: input.language,
              status: "pending",
              tapCount: 0,
              error: null,
            };
        events.set(event.id, event);
        return event;
      },
      async getEvent(id) {
        return events.get(id) ?? null;
      },
      async updateEvent(id, patch) {
        const e = events.get(id);
        if (e) events.set(id, { ...e, ...patch });
      },
      async ensureConversation() {
        return "conv-1";
      },
      async logMessage(msg) {
        if (msg.platformMessageId && messages.some((m) => m.platformMessageId === msg.platformMessageId)) {
          return "duplicate";
        }
        messages.push(msg);
        return "inserted";
      },
    },
    meta: {
      async replyToComment(_channelId, commentId, text) {
        if (opts.publicReplyError) throw new Error(opts.publicReplyError);
        sent.push({ kind: "public", target: commentId, text });
      },
      async sendPrivateReply(_channelId, commentId, msg) {
        if (state.privateReplyError) throw new Error(state.privateReplyError);
        sent.push({ kind: "private", target: commentId, msg });
        return {
          messageId: `mid-${nextMid++}`,
          recipientId: opts.recipientId === null ? undefined : (opts.recipientId ?? "igsid-1"),
        };
      },
      async sendButtonMessage(_channelId, recipientId, msg) {
        if (opts.dmError) throw new Error(opts.dmError);
        sent.push({ kind: "dm", target: recipientId, msg });
        return { messageId: `mid-${nextMid++}` };
      },
      async checkFollows() {
        followChecks++;
        return state.follow;
      },
    },
  };

  return { deps, channel, state, events, messages, sent, followChecks: () => followChecks };
}

export function comment(over: Partial<CommentEvent> = {}): CommentEvent {
  return {
    accountId: ACCOUNT_ID,
    commentId: "c-1",
    mediaId: "media-1",
    commenterId: "commenter-1",
    commenterUsername: "sara",
    text: "I want it!",
    ...over,
  };
}

export function tap(payload: string, over: Partial<TapEvent> = {}): TapEvent {
  return {
    accountId: ACCOUNT_ID,
    senderId: "igsid-1",
    mid: "tap-1",
    title: "Send me the link",
    payload,
    ...over,
  };
}

/** The payload of a sent message's postback button, or null. */
export function payloadOf(msg: ButtonMessage | undefined): string | null {
  return msg?.button.type === "postback" ? msg.button.payload : null;
}
```

- [ ] **Step 2: Write the failing test**

`tests/comment-dm-comment.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { handleComment } from "../src/lib/comment-dm/flow.ts";
import { decodePayload } from "../src/lib/comment-dm/parse.ts";
import { DEFAULT_TEXTS } from "../src/lib/comment-dm/texts.ts";
import type { CommentDmSettings } from "../src/lib/comment-dm/types.ts";
import { ACCOUNT_ID, comment, makeFakes, payloadOf } from "./helpers/comment-dm-fakes.ts";

test("replies under the comment and sends the first DM with a button", async () => {
  const f = makeFakes();
  assert.equal(await handleComment(comment(), f.deps), "dm_sent");

  assert.deepEqual(f.sent.map((s) => s.kind), ["public", "private"]);
  assert.equal(f.sent[0]!.target, "c-1");
  assert.equal(f.sent[0]!.text, DEFAULT_TEXTS.en.publicReply);
  const dm = f.sent[1]!.msg!;
  assert.equal(dm.text, DEFAULT_TEXTS.en.opening);
  assert.equal(dm.button.title, DEFAULT_TEXTS.en.openingButton);

  const [event] = [...f.events.values()];
  assert.equal(decodePayload(payloadOf(dm)), event!.id);
  assert.equal(event!.status, "dm_sent");
  assert.equal(event!.recipientId, "igsid-1");
  assert.equal(event!.conversationId, "conv-1");
  assert.equal(event!.error, null);

  assert.equal(f.messages.length, 1);
  assert.equal(f.messages[0]!.direction, "out");
  assert.equal(f.messages[0]!.sender, "ai");
  assert.equal(f.messages[0]!.platformMessageId, "mid-1");
  assert.match(f.messages[0]!.content, /\[Send me the link\]$/);
});

test("answers an Arabic comment in Arabic", async () => {
  const f = makeFakes();
  await handleComment(comment({ text: "كم السعر؟" }), f.deps);
  assert.equal(f.sent[0]!.text, DEFAULT_TEXTS.ar.publicReply);
  assert.equal(f.sent[1]!.msg!.text, DEFAULT_TEXTS.ar.opening);
  assert.equal([...f.events.values()][0]!.language, "ar");
});

test("uses the account's default language when the comment has no words", async () => {
  const f = makeFakes({ settings: { defaultLanguage: "ar" } });
  await handleComment(comment({ text: "🔥🔥" }), f.deps);
  assert.equal(f.sent[1]!.msg!.text, DEFAULT_TEXTS.ar.opening);
});

test("uses the owner's own texts when set", async () => {
  const f = makeFakes({ settings: { texts: { en: { opening: "Want the trial? Tap below." } } } });
  await handleComment(comment(), f.deps);
  assert.equal(f.sent[1]!.msg!.text, "Want the trial? Tap below.");
  assert.equal(f.sent[1]!.msg!.button.title, DEFAULT_TEXTS.en.openingButton);
});

test("ignores the account's own comments, by id or by username", async () => {
  const f = makeFakes();
  assert.equal(await handleComment(comment({ commenterId: ACCOUNT_ID }), f.deps), "own_comment");
  assert.equal(await handleComment(comment({ commenterUsername: "Shop" }), f.deps), "own_comment");
  assert.equal(f.sent.length, 0);
});

test("does nothing when the feature is off, has no link, or was never set up", async () => {
  const cases: Array<Partial<CommentDmSettings> | null> = [{ enabled: false }, { linkUrl: null }, null];
  for (const settings of cases) {
    const f = makeFakes({ settings });
    assert.equal(await handleComment(comment(), f.deps), "disabled");
    assert.equal(f.sent.length, 0);
    assert.equal(f.events.size, 0);
  }
});

test("does nothing while the channel needs reconnecting", async () => {
  const f = makeFakes({ channel: { status: "error" } });
  assert.equal(await handleComment(comment(), f.deps), "channel_inactive");
  assert.equal(f.sent.length, 0);
});

test("ignores comments on accounts we don't know", async () => {
  const f = makeFakes();
  assert.equal(await handleComment(comment({ accountId: "17841499999999999" }), f.deps), "no_channel");
});

test("one DM per person per post", async () => {
  const f = makeFakes();
  assert.equal(await handleComment(comment(), f.deps), "dm_sent");
  assert.equal(await handleComment(comment({ commentId: "c-2" }), f.deps), "already_sent");
  assert.equal(await handleComment(comment({ commentId: "c-3", mediaId: "media-2" }), f.deps), "dm_sent");
  assert.equal(f.sent.filter((s) => s.kind === "private").length, 2);
});

test("a failed DM is saved, and the person's next comment on that post retries it", async () => {
  const f = makeFakes({ privateReplyError: "Rate limit hit (code 4)" });
  assert.equal(await handleComment(comment(), f.deps), "failed");
  const [failed] = [...f.events.values()];
  assert.equal(failed!.status, "failed");
  assert.equal(failed!.error, "Rate limit hit (code 4)");
  assert.equal(f.messages.length, 0);

  f.state.privateReplyError = undefined;
  assert.equal(await handleComment(comment({ commentId: "c-2" }), f.deps), "dm_sent");
  assert.equal(f.events.size, 1);
  assert.equal([...f.events.values()][0]!.status, "dm_sent");
});

test("skips the public reply when it's turned off", async () => {
  const f = makeFakes({ settings: { publicReplyEnabled: false } });
  await handleComment(comment(), f.deps);
  assert.deepEqual(f.sent.map((s) => s.kind), ["private"]);
});

test("a failed public reply doesn't stop the DM", async () => {
  const f = makeFakes({ publicReplyError: "Comment was deleted" });
  assert.equal(await handleComment(comment(), f.deps), "dm_sent");
  assert.equal([...f.events.values()][0]!.error, "public reply: Comment was deleted");
});

test("falls back to the commenter's id when Meta returns no recipient id", async () => {
  const f = makeFakes({ recipientId: null });
  await handleComment(comment(), f.deps);
  assert.equal([...f.events.values()][0]!.recipientId, "commenter-1");
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `node --test tests/comment-dm-comment.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/lib/comment-dm/flow.ts`.

- [ ] **Step 4: Write flow.ts with handleComment**

`src/lib/comment-dm/flow.ts`:

```ts
import { encodePayload } from "./parse.ts";
import { pickLanguage, resolveTexts } from "./texts.ts";
import type {
  ButtonMessage,
  ChannelInfo,
  CommentDmDeps,
  CommentEvent,
  SendResult,
} from "./types.ts";

/**
 * Comment-to-DM decisions. All database and Instagram access goes through
 * `deps`, so this file stays pure and is unit-tested with fakes.
 */

export type CommentOutcome =
  | "no_channel"
  | "own_comment"
  | "disabled"
  | "channel_inactive"
  | "already_sent"
  | "dm_sent"
  | "failed";

export function errorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.slice(0, 300);
}

/** How a sent DM reads in the InboxWeave inbox. */
export function inboxText(msg: ButtonMessage): string {
  const b = msg.button;
  return b.type === "web_url" ? `${msg.text}\n\n[${b.title}] ${b.url}` : `${msg.text}\n\n[${b.title}]`;
}

function isOwnComment(ev: CommentEvent, channel: ChannelInfo): boolean {
  if (ev.commenterId === channel.externalId) return true;
  return (
    !!ev.commenterUsername &&
    !!channel.username &&
    ev.commenterUsername.toLowerCase() === channel.username.toLowerCase()
  );
}

export async function handleComment(ev: CommentEvent, { store, meta }: CommentDmDeps): Promise<CommentOutcome> {
  const channel = await store.getChannelByExternalId(ev.accountId);
  if (!channel) return "no_channel";
  // Includes our own public replies, which come back as comments: no loops.
  if (isOwnComment(ev, channel)) return "own_comment";

  const settings = await store.getSettings(channel.id);
  if (!settings?.enabled || !settings.linkUrl) return "disabled";
  if (channel.status !== "active") return "channel_inactive";

  const language = pickLanguage(ev.text, settings.defaultLanguage);
  const event = await store.claimEvent({
    orgId: channel.orgId,
    channelId: channel.id,
    mediaId: ev.mediaId,
    commenterId: ev.commenterId,
    commenterUsername: ev.commenterUsername ?? null,
    commentId: ev.commentId,
    commentText: ev.text.slice(0, 500),
    language,
  });
  if (!event) return "already_sent";

  const texts = resolveTexts(settings.texts, language);

  // The public reply is a nice-to-have: if it fails, still send the DM.
  let publicReplyError: string | null = null;
  if (settings.publicReplyEnabled) {
    try {
      await meta.replyToComment(channel.id, ev.commentId, texts.publicReply);
    } catch (err) {
      publicReplyError = `public reply: ${errorText(err)}`;
    }
  }

  const opening: ButtonMessage = {
    text: texts.opening,
    button: { type: "postback", title: texts.openingButton, payload: encodePayload(event.id) },
  };
  let sent: SendResult;
  try {
    sent = await meta.sendPrivateReply(channel.id, ev.commentId, opening);
  } catch (err) {
    await store.updateEvent(event.id, { status: "failed", error: errorText(err) });
    return "failed";
  }

  const recipientId = sent.recipientId ?? ev.commenterId;
  const conversationId = await store.ensureConversation({
    orgId: channel.orgId,
    channelId: channel.id,
    contactExternalId: recipientId,
    contactUsername: ev.commenterUsername ?? null,
    language,
  });
  await store.logMessage({
    orgId: channel.orgId,
    conversationId,
    direction: "out",
    sender: "ai",
    content: inboxText(opening),
    platformMessageId: sent.messageId ?? null,
  });
  await store.updateEvent(event.id, { status: "dm_sent", recipientId, conversationId, error: publicReplyError });
  return "dm_sent";
}
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `node --test tests/comment-dm-comment.test.ts && npm run typecheck`
Expected: 13 tests pass; no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/comment-dm/flow.ts tests/helpers/comment-dm-fakes.ts tests/comment-dm-comment.test.ts
git commit -m "Reply to new comments with a public reply and a DM button" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The tap flow

**Files:**
- Modify: `src/lib/comment-dm/flow.ts`
- Test: `tests/comment-dm-tap.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/comment-dm-tap.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_TAPS, handleComment, handleTap } from "../src/lib/comment-dm/flow.ts";
import { decodePayload, encodePayload } from "../src/lib/comment-dm/parse.ts";
import { DEFAULT_TEXTS } from "../src/lib/comment-dm/texts.ts";
import type { CommentEvent } from "../src/lib/comment-dm/types.ts";
import { comment, makeFakes, payloadOf, tap, type FakeOptions } from "./helpers/comment-dm-fakes.ts";

/** Someone commented and got the first DM. Returns the fakes, ready for taps. */
async function afterFirstDm(opts: FakeOptions = {}, commentOver: Partial<CommentEvent> = {}) {
  const f = makeFakes(opts);
  assert.equal(await handleComment(comment(commentOver), f.deps), "dm_sent");
  const event = [...f.events.values()][0]!;
  f.sent.length = 0; // only look at what the taps send
  return { f, event, payload: encodePayload(event.id) };
}

test("a follower gets the link", async () => {
  const { f, event, payload } = await afterFirstDm();
  assert.equal(await handleTap(tap(payload), f.deps), "link_sent");

  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0]!.target, "igsid-1");
  const msg = f.sent[0]!.msg!;
  assert.equal(msg.text, DEFAULT_TEXTS.en.linkMessage);
  assert.deepEqual(msg.button, { type: "web_url", title: DEFAULT_TEXTS.en.linkButton, url: "https://example.com/trial" });

  const updated = f.events.get(event.id)!;
  assert.equal(updated.status, "link_sent");
  assert.equal(updated.tapCount, 1);
  // The first DM, the tap, the link.
  assert.deepEqual(f.messages.map((m) => m.direction), ["out", "in", "out"]);
  assert.equal(f.messages[1]!.content, "Send me the link");
  assert.equal(f.messages[1]!.sender, "contact");
});

test("a non-follower is asked to follow, then gets the link after tapping again", async () => {
  const { f, event, payload } = await afterFirstDm({ follow: { ok: true, follows: false } });
  assert.equal(await handleTap(tap(payload), f.deps), "awaiting_follow");
  const ask = f.sent[0]!.msg!;
  assert.equal(ask.text, DEFAULT_TEXTS.en.followFirst);
  assert.equal(ask.button.title, DEFAULT_TEXTS.en.followedButton);
  assert.equal(decodePayload(payloadOf(ask)), event.id);
  assert.equal(f.events.get(event.id)!.status, "awaiting_follow");

  f.state.follow = { ok: true, follows: true };
  assert.equal(await handleTap(tap(payload, { mid: "tap-2", title: "I followed ✅" }), f.deps), "link_sent");
  assert.equal(f.sent[1]!.msg!.button.type, "web_url");
  assert.equal(f.events.get(event.id)!.tapCount, 2);
});

test("if Instagram's follow check fails, the link is sent anyway", async () => {
  const { f, event, payload } = await afterFirstDm({ follow: { ok: false, error: "Rate limit hit" } });
  assert.equal(await handleTap(tap(payload), f.deps), "link_sent");
  assert.equal(f.events.get(event.id)!.error, "follow check: Rate limit hit");
});

test("with require follow off, the link goes out without a follow check", async () => {
  const { f, payload } = await afterFirstDm({ settings: { requireFollow: false } });
  assert.equal(await handleTap(tap(payload), f.deps), "link_sent");
  assert.equal(f.followChecks(), 0);
});

test("answers in the language of the original comment", async () => {
  const { f, payload } = await afterFirstDm({}, { text: "أبي الرابط" });
  await handleTap(tap(payload, { title: "أرسل لي الرابط" }), f.deps);
  assert.equal(f.sent[0]!.msg!.text, DEFAULT_TEXTS.ar.linkMessage);
});

test("ignores buttons that aren't ours or point at unknown events", async () => {
  const { f } = await afterFirstDm();
  assert.equal(await handleTap(tap("SOMETHING_ELSE"), f.deps), "not_ours");
  assert.equal(await handleTap(tap(encodePayload("00000000-0000-4000-8000-999999999999")), f.deps), "unknown_event");
  assert.equal(f.sent.length, 0);
});

test("only the person we DMed, on the account we DMed from, can use the button", async () => {
  const { f, payload } = await afterFirstDm();
  assert.equal(await handleTap(tap(payload, { senderId: "someone-else" }), f.deps), "mismatch");
  assert.equal(await handleTap(tap(payload, { accountId: "17841499999999999" }), f.deps), "mismatch");
  assert.equal(f.sent.length, 0);
});

test("the same tap delivered twice is answered once", async () => {
  const { f, payload } = await afterFirstDm();
  assert.equal(await handleTap(tap(payload), f.deps), "link_sent");
  assert.equal(await handleTap(tap(payload), f.deps), "duplicate");
  assert.equal(f.sent.length, 1);
});

test(`stops answering after ${MAX_TAPS} taps`, async () => {
  const { f, payload } = await afterFirstDm({ follow: { ok: true, follows: false } });
  for (let i = 1; i <= MAX_TAPS; i++) {
    assert.equal(await handleTap(tap(payload, { mid: `tap-${i}` }), f.deps), "awaiting_follow");
  }
  assert.equal(await handleTap(tap(payload, { mid: "tap-extra" }), f.deps), "tap_limit");
  assert.equal(f.sent.length, MAX_TAPS);
});

test("still answers after the owner turned the feature off", async () => {
  const { f, payload } = await afterFirstDm();
  f.state.settings = { ...f.state.settings!, enabled: false };
  assert.equal(await handleTap(tap(payload), f.deps), "link_sent");
});

test("marks the event failed when the link was removed", async () => {
  const { f, event, payload } = await afterFirstDm();
  f.state.settings = { ...f.state.settings!, linkUrl: null };
  assert.equal(await handleTap(tap(payload), f.deps), "no_link");
  assert.equal(f.events.get(event.id)!.status, "failed");
  assert.equal(f.events.get(event.id)!.error, "no link set");
  assert.equal(f.sent.length, 0);
});

test("a failed send marks the event failed", async () => {
  const { f, event, payload } = await afterFirstDm({ dmError: "User can't receive messages" });
  assert.equal(await handleTap(tap(payload), f.deps), "failed");
  assert.equal(f.events.get(event.id)!.status, "failed");
  assert.equal(f.events.get(event.id)!.error, "User can't receive messages");
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test tests/comment-dm-tap.test.ts`
Expected: FAIL with `SyntaxError: The requested module '../src/lib/comment-dm/flow.ts' does not provide an export named 'MAX_TAPS'`.

- [ ] **Step 3: Update flow.ts imports**

In `src/lib/comment-dm/flow.ts`, replace:

```ts
import { encodePayload } from "./parse.ts";
import { pickLanguage, resolveTexts } from "./texts.ts";
import type {
  ButtonMessage,
  ChannelInfo,
  CommentDmDeps,
  CommentEvent,
  SendResult,
} from "./types.ts";
```

with:

```ts
import { decodePayload, encodePayload } from "./parse.ts";
import { pickLanguage, resolveTexts } from "./texts.ts";
import type {
  ButtonMessage,
  ChannelInfo,
  CommentDmDeps,
  CommentEvent,
  SendResult,
  TapEvent,
} from "./types.ts";
```

- [ ] **Step 4: Append handleTap to flow.ts**

Add to the end of `src/lib/comment-dm/flow.ts`:

```ts
/** Past this many taps on one person+post, stop answering (spam guard). */
export const MAX_TAPS = 10;

export type TapOutcome =
  | "not_ours"
  | "unknown_event"
  | "mismatch"
  | "duplicate"
  | "tap_limit"
  | "no_link"
  | "link_sent"
  | "awaiting_follow"
  | "failed";

export async function handleTap(ev: TapEvent, { store, meta }: CommentDmDeps): Promise<TapOutcome> {
  const eventId = decodePayload(ev.payload);
  if (!eventId) return "not_ours";
  const event = await store.getEvent(eventId);
  if (!event) return "unknown_event";
  const channel = await store.getChannelById(event.channelId);
  // Only the person we DMed, on the account we DMed them from, can use the button.
  if (!channel || channel.externalId !== ev.accountId || event.recipientId !== ev.senderId) return "mismatch";

  const conversationId =
    event.conversationId ??
    (await store.ensureConversation({
      orgId: event.orgId,
      channelId: channel.id,
      contactExternalId: ev.senderId,
      contactUsername: event.commenterUsername,
      language: event.language,
    }));

  // Saving the tap doubles as the redelivery check: Meta can send the same tap twice.
  const logged = await store.logMessage({
    orgId: event.orgId,
    conversationId,
    direction: "in",
    sender: "contact",
    content: ev.title || "[button]",
    platformMessageId: ev.mid,
  });
  if (logged === "duplicate") return "duplicate";

  const tapCount = event.tapCount + 1;
  if (tapCount > MAX_TAPS) {
    await store.updateEvent(event.id, { tapCount });
    return "tap_limit";
  }

  // Answer even if the owner has since turned the feature off: they were promised a link.
  const settings = await store.getSettings(channel.id);
  if (!settings?.linkUrl) {
    await store.updateEvent(event.id, { tapCount, conversationId, status: "failed", error: "no link set" });
    return "no_link";
  }
  const texts = resolveTexts(settings.texts, event.language);

  let sendLink = true;
  let followError: string | null = null;
  if (settings.requireFollow) {
    const follow = await meta.checkFollows(channel.id, ev.senderId);
    if (follow.ok) sendLink = follow.follows;
    else followError = `follow check: ${follow.error}`; // fail open: send the link
  }

  const reply: ButtonMessage = sendLink
    ? { text: texts.linkMessage, button: { type: "web_url", title: texts.linkButton, url: settings.linkUrl } }
    : {
        text: texts.followFirst,
        button: { type: "postback", title: texts.followedButton, payload: encodePayload(event.id) },
      };

  let sent: SendResult;
  try {
    sent = await meta.sendButtonMessage(channel.id, ev.senderId, reply);
  } catch (err) {
    await store.updateEvent(event.id, { tapCount, conversationId, status: "failed", error: errorText(err) });
    return "failed";
  }

  await store.logMessage({
    orgId: event.orgId,
    conversationId,
    direction: "out",
    sender: "ai",
    content: inboxText(reply),
    platformMessageId: sent.messageId ?? null,
  });
  const status = sendLink ? "link_sent" : "awaiting_follow";
  await store.updateEvent(event.id, { tapCount, conversationId, status, error: followError });
  return status;
}
```

- [ ] **Step 5: Run all tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: every test passes (the existing 59 plus the new ones); no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/comment-dm/flow.ts tests/comment-dm-tap.test.ts
git commit -m "Check the follow on a button tap and send the link or ask them to follow" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Database migration

**Files:**
- Create: `supabase/migrations/0021_comment_dm.sql`

- [ ] **Step 1: Write the migration**

`supabase/migrations/0021_comment_dm.sql`:

```sql
-- ============================================================================
-- 0021 — Comment-to-DM for Instagram
-- When someone comments on an Instagram account that turned this on, we reply
-- under the comment and DM them a button; tapping it sends the owner's link
-- once they follow. One settings row per Instagram channel, one event row per
-- person per post. channels.granted_scopes records what the account allowed
-- at connect time, so we know whether it has comment access.
-- ============================================================================

alter table public.channels
  add column if not exists granted_scopes text[];

comment on column public.channels.granted_scopes is
  'Permissions granted at the last Instagram connect. Null = connected before 0021 (no comment access).';

create table if not exists public.comment_dm_settings (
  channel_id            uuid primary key references public.channels(id) on delete cascade,
  org_id                uuid not null references public.organizations(id) on delete cascade,
  enabled               boolean not null default false,
  link_url              text,
  default_language      text not null default 'en' check (default_language in ('en', 'ar')),
  require_follow        boolean not null default true,
  public_reply_enabled  boolean not null default true,
  texts                 jsonb not null default '{}'::jsonb,
  updated_at            timestamptz not null default now()
);

create index if not exists comment_dm_settings_org_idx on public.comment_dm_settings(org_id);

create table if not exists public.comment_dm_events (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  channel_id          uuid not null references public.channels(id) on delete cascade,
  media_id            text not null,
  commenter_id        text not null,
  commenter_username  text,
  comment_id          text not null,
  comment_text        text,
  recipient_id        text,
  conversation_id     uuid references public.conversations(id) on delete set null,
  language            text not null check (language in ('en', 'ar')),
  status              text not null default 'pending'
                      check (status in ('pending', 'dm_sent', 'awaiting_follow', 'link_sent', 'failed')),
  tap_count           int not null default 0,
  error               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- One DM per person per post; also absorbs Meta redelivering a comment.
  unique (channel_id, media_id, commenter_id)
);

create index if not exists comment_dm_events_channel_status_idx
  on public.comment_dm_events(channel_id, status, updated_at desc);

-- Read and written only by the server with the service role, like offers (0019).
alter table public.comment_dm_settings enable row level security;
alter table public.comment_dm_events enable row level security;
grant select, insert, update, delete on public.comment_dm_settings to service_role;
grant select, insert, update, delete on public.comment_dm_events to service_role;

-- Claim the person+post row for a new comment. Returns the row when this
-- comment should get a DM, nothing when it shouldn't. A row that failed, or
-- was left pending by a run that died more than 10 minutes ago, is taken back.
create or replace function public.claim_comment_dm(
  p_org_id uuid,
  p_channel_id uuid,
  p_media_id text,
  p_commenter_id text,
  p_commenter_username text,
  p_comment_id text,
  p_comment_text text,
  p_language text
)
returns setof public.comment_dm_events
language sql
volatile
set search_path = public
as $$
  insert into public.comment_dm_events as e
    (org_id, channel_id, media_id, commenter_id, commenter_username, comment_id, comment_text, language)
  values
    (p_org_id, p_channel_id, p_media_id, p_commenter_id, p_commenter_username, p_comment_id,
     left(p_comment_text, 500), p_language)
  on conflict (channel_id, media_id, commenter_id) do update
    set comment_id = excluded.comment_id,
        comment_text = excluded.comment_text,
        commenter_username = excluded.commenter_username,
        language = excluded.language,
        status = 'pending',
        error = null,
        updated_at = now()
    where e.status = 'failed'
       or (e.status = 'pending' and e.updated_at < now() - interval '10 minutes')
  returning e.*;
$$;

revoke execute on function public.claim_comment_dm(uuid, uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_comment_dm(uuid, uuid, text, text, text, text, text, text)
  to service_role;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0021_comment_dm.sql
git commit -m "Add tables for Comment-to-DM settings and events" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Apply it (stop and ask the user; this needs database access)**

This repo has no local `.env`, so the user applies it the same way they applied 0020: either paste the file into the Supabase SQL editor, or run `node scripts/run-migration.mjs supabase/migrations/0021_comment_dm.sql` with the database env vars set. It must be applied before the code is deployed.

- [ ] **Step 4: Check the claim function (the user runs this in the SQL editor)**

Replace `<org>` and `<channel>` with a real org id and channel id. The transaction is rolled back, so nothing is kept.

```sql
begin;
select status from public.claim_comment_dm('<org>', '<channel>', 'm1', 'u1', 'sara', 'c1', 'hi', 'en');  -- 1 row: pending
select count(*) from public.claim_comment_dm('<org>', '<channel>', 'm1', 'u1', 'sara', 'c2', 'hi', 'en'); -- 0
update public.comment_dm_events set status = 'failed' where comment_id = 'c1';
select comment_id from public.claim_comment_dm('<org>', '<channel>', 'm1', 'u1', 'sara', 'c3', 'hi', 'en'); -- c3
rollback;
```

---

### Task 9: The Supabase store and the overview

Server-only, so no unit tests. `npm run typecheck` checks them; the flow tests already cover the behavior through the `CommentDmStore` interface.

**Files:**
- Create: `src/lib/comment-dm/store.ts`, `src/lib/comment-dm/overview.ts`

- [ ] **Step 1: Write store.ts**

`src/lib/comment-dm/store.ts`:

```ts
import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  ChannelInfo,
  CommentDmSettings,
  CommentDmStore,
  DmEvent,
  EventStatus,
  SavedTexts,
} from "./types";

type Admin = ReturnType<typeof createSupabaseAdminClient>;
type Row = Record<string, unknown>;

const CHANNEL_COLUMNS = "id, org_id, external_id, display_name, status";
const EVENT_COLUMNS =
  "id, org_id, channel_id, media_id, commenter_id, commenter_username, comment_id, recipient_id, conversation_id, language, status, tap_count, error";

function toChannel(r: Row): ChannelInfo {
  return {
    id: r.id as string,
    orgId: r.org_id as string,
    externalId: r.external_id as string,
    username: (r.display_name as string | null) ?? null,
    status: r.status as string,
  };
}

export function toSettings(r: Row): CommentDmSettings {
  return {
    channelId: r.channel_id as string,
    orgId: r.org_id as string,
    enabled: r.enabled === true,
    linkUrl: (r.link_url as string | null) ?? null,
    defaultLanguage: r.default_language === "ar" ? "ar" : "en",
    requireFollow: r.require_follow !== false,
    publicReplyEnabled: r.public_reply_enabled !== false,
    texts: (r.texts as SavedTexts | null) ?? {},
  };
}

/** The saved settings, or what a channel that was never set up looks like. */
export function settingsOrDefaults(row: Row | null | undefined, channelId: string, orgId: string): CommentDmSettings {
  if (row) return toSettings(row);
  return {
    channelId,
    orgId,
    enabled: false,
    linkUrl: null,
    defaultLanguage: "en",
    requireFollow: true,
    publicReplyEnabled: true,
    texts: {},
  };
}

function toEvent(r: Row): DmEvent {
  return {
    id: r.id as string,
    orgId: r.org_id as string,
    channelId: r.channel_id as string,
    mediaId: r.media_id as string,
    commenterId: r.commenter_id as string,
    commenterUsername: (r.commenter_username as string | null) ?? null,
    commentId: r.comment_id as string,
    recipientId: (r.recipient_id as string | null) ?? null,
    conversationId: (r.conversation_id as string | null) ?? null,
    language: r.language === "ar" ? "ar" : "en",
    status: r.status as EventStatus,
    tapCount: Number(r.tap_count ?? 0),
    error: (r.error as string | null) ?? null,
  };
}

export function createStore(admin: Admin = createSupabaseAdminClient()): CommentDmStore {
  return {
    async getChannelByExternalId(externalId) {
      const { data, error } = await admin
        .from("channels")
        .select(CHANNEL_COLUMNS)
        .eq("platform", "instagram")
        .eq("external_id", externalId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toChannel(data) : null;
    },

    async getChannelById(id) {
      const { data, error } = await admin
        .from("channels")
        .select(CHANNEL_COLUMNS)
        .eq("id", id)
        .eq("platform", "instagram")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toChannel(data) : null;
    },

    async getSettings(channelId) {
      const { data, error } = await admin
        .from("comment_dm_settings")
        .select("*")
        .eq("channel_id", channelId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toSettings(data) : null;
    },

    async claimEvent(input) {
      const { data, error } = await admin.rpc("claim_comment_dm", {
        p_org_id: input.orgId,
        p_channel_id: input.channelId,
        p_media_id: input.mediaId,
        p_commenter_id: input.commenterId,
        p_commenter_username: input.commenterUsername,
        p_comment_id: input.commentId,
        p_comment_text: input.commentText,
        p_language: input.language,
      });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as Row[];
      return rows[0] ? toEvent(rows[0]) : null;
    },

    async getEvent(id) {
      const { data, error } = await admin.from("comment_dm_events").select(EVENT_COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toEvent(data) : null;
    },

    async updateEvent(id, patch) {
      const row: Row = { updated_at: new Date().toISOString() };
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.recipientId !== undefined) row.recipient_id = patch.recipientId;
      if (patch.conversationId !== undefined) row.conversation_id = patch.conversationId;
      if (patch.tapCount !== undefined) row.tap_count = patch.tapCount;
      if (patch.error !== undefined) row.error = patch.error;
      const { error } = await admin.from("comment_dm_events").update(row).eq("id", id);
      if (error) throw new Error(error.message);
    },

    async ensureConversation(input) {
      const { data, error } = await admin
        .from("conversations")
        .upsert(
          {
            org_id: input.orgId,
            channel_id: input.channelId,
            contact_external_id: input.contactExternalId,
            last_message_at: new Date().toISOString(),
          },
          { onConflict: "channel_id,contact_external_id" },
        )
        .select("id, contact_username, language")
        .single();
      if (error || !data) throw new Error(error?.message ?? "Failed to upsert conversation");
      // Fill gaps only; never overwrite what the inbox already knows.
      const patch: Row = {};
      if (!data.contact_username && input.contactUsername) patch.contact_username = input.contactUsername;
      if (!data.language) patch.language = input.language;
      if (Object.keys(patch).length > 0) {
        await admin.from("conversations").update(patch).eq("id", data.id);
      }
      return data.id as string;
    },

    async logMessage(msg) {
      if (msg.platformMessageId) {
        const { data: dup } = await admin
          .from("messages")
          .select("id")
          .eq("platform_message_id", msg.platformMessageId)
          .limit(1);
        if (dup && dup.length > 0) return "duplicate";
      }
      const { error } = await admin.from("messages").insert({
        org_id: msg.orgId,
        conversation_id: msg.conversationId,
        direction: msg.direction,
        sender: msg.sender,
        content: msg.content,
        platform_message_id: msg.platformMessageId,
      });
      if (error) throw new Error(error.message);
      await admin
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", msg.conversationId);
      return "inserted";
    },
  };
}
```

- [ ] **Step 2: Write overview.ts**

`src/lib/comment-dm/overview.ts`:

```ts
import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface CommentDmOverview {
  dmsSent: number;
  linksSent: number;
  awaitingFollow: number;
  failed: number;
  recentFailures: Array<{ id: string; commenterUsername: string | null; error: string | null; updatedAt: string }>;
}

/** All-time counts and the 5 latest failures for one channel's settings page. */
export async function getCommentDmOverview(channelId: string): Promise<CommentDmOverview> {
  const admin = createSupabaseAdminClient();
  const count = (statuses: string[]) =>
    admin
      .from("comment_dm_events")
      .select("id", { count: "exact", head: true })
      .eq("channel_id", channelId)
      .in("status", statuses);

  const [dms, links, waiting, failed, recent] = await Promise.all([
    count(["dm_sent", "awaiting_follow", "link_sent"]),
    count(["link_sent"]),
    count(["awaiting_follow"]),
    count(["failed"]),
    admin
      .from("comment_dm_events")
      .select("id, commenter_username, error, updated_at")
      .eq("channel_id", channelId)
      .eq("status", "failed")
      .order("updated_at", { ascending: false })
      .limit(5),
  ]);

  return {
    dmsSent: dms.count ?? 0,
    linksSent: links.count ?? 0,
    awaitingFollow: waiting.count ?? 0,
    failed: failed.count ?? 0,
    recentFailures: (recent.data ?? []).map((r) => ({
      id: r.id as string,
      commenterUsername: (r.commenter_username as string | null) ?? null,
      error: (r.error as string | null) ?? null,
      updatedAt: r.updated_at as string,
    })),
  };
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npx eslint src/lib/comment-dm`
Expected: no type errors; no lint errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/comment-dm/store.ts src/lib/comment-dm/overview.ts
git commit -m "Store Comment-to-DM events and settings in Supabase" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Instagram calls and the entry points

**Files:**
- Create: `src/lib/comment-dm/templates.ts`, `src/lib/comment-dm/meta.ts`, `src/lib/comment-dm/index.ts`
- Test: `tests/comment-dm-templates.test.ts`

**Use Task 1's results here.** If the button template was rejected in private replies, set `TEMPLATE_STYLE = "generic"` in templates.ts. If the public reply needed the token in the query, change `replyToComment` in meta.ts to send `access_token` as a query parameter. If Task 1 hasn't run yet, build with the defaults below and flag it in the task report.

- [ ] **Step 1: Write the failing test**

`tests/comment-dm-templates.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { templateMessage } from "../src/lib/comment-dm/templates.ts";

test("builds a button template with a postback button", () => {
  assert.deepEqual(
    templateMessage({ text: "Tap below", button: { type: "postback", title: "Send me the link", payload: "cdm:x" } }, "button"),
    {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Tap below",
          buttons: [{ type: "postback", title: "Send me the link", payload: "cdm:x" }],
        },
      },
    },
  );
});

test("builds a button template with a link button", () => {
  assert.deepEqual(
    templateMessage({ text: "Here's your link", button: { type: "web_url", title: "Open link", url: "https://example.com" } }, "button"),
    {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Here's your link",
          buttons: [{ type: "web_url", title: "Open link", url: "https://example.com" }],
        },
      },
    },
  );
});

test("the generic fallback splits long text into title and subtitle", () => {
  const text = "a".repeat(100);
  assert.deepEqual(templateMessage({ text, button: { type: "postback", title: "Go", payload: "cdm:x" } }, "generic"), {
    attachment: {
      type: "template",
      payload: {
        template_type: "generic",
        elements: [{ title: "a".repeat(80), subtitle: "a".repeat(20), buttons: [{ type: "postback", title: "Go", payload: "cdm:x" }] }],
      },
    },
  });
});

test("the generic fallback leaves out an empty subtitle", () => {
  assert.deepEqual(templateMessage({ text: "Hi", button: { type: "postback", title: "Go", payload: "cdm:x" } }, "generic"), {
    attachment: {
      type: "template",
      payload: { template_type: "generic", elements: [{ title: "Hi", buttons: [{ type: "postback", title: "Go", payload: "cdm:x" }] }] },
    },
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test tests/comment-dm-templates.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/lib/comment-dm/templates.ts`.

- [ ] **Step 3: Write templates.ts**

`src/lib/comment-dm/templates.ts`:

```ts
import type { Button, ButtonMessage } from "./types.ts";

/**
 * Instagram message bodies for Comment-to-DM. Pure.
 * "button" is Instagram's button template. If private replies reject it
 * (checked in Task 1 of the plan), switch to "generic": one card, one button.
 */
export const TEMPLATE_STYLE: "button" | "generic" = "button";

function toGraphButton(b: Button) {
  return b.type === "postback"
    ? { type: "postback", title: b.title, payload: b.payload }
    : { type: "web_url", title: b.title, url: b.url };
}

export function templateMessage(msg: ButtonMessage, style: "button" | "generic" = TEMPLATE_STYLE) {
  const button = toGraphButton(msg.button);
  if (style === "generic") {
    const title = msg.text.slice(0, 80);
    const subtitle = msg.text.slice(80, 160);
    const element = subtitle ? { title, subtitle, buttons: [button] } : { title, buttons: [button] };
    return { attachment: { type: "template", payload: { template_type: "generic", elements: [element] } } };
  }
  return {
    attachment: { type: "template", payload: { template_type: "button", text: msg.text, buttons: [button] } },
  };
}
```

- [ ] **Step 4: Run the test**

Run: `node --test tests/comment-dm-templates.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Write meta.ts**

`src/lib/comment-dm/meta.ts`:

```ts
import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, pgByteaToBuffer } from "@/lib/crypto/secrets";
import {
  getCachedDecryptedToken,
  invalidateCachedDecryptedToken,
  setCachedDecryptedToken,
} from "@/lib/channels/cache";
import { isTokenError, markChannelUnhealthy } from "@/lib/channels/health";
import { refreshIgTokenIfStale } from "@/lib/channels/ig-token-refresh";
import { templateMessage } from "./templates";
import type { CommentDmMeta, FollowResult } from "./types";

// Comment-to-DM needs Instagram Business Login tokens, which use this host.
const GRAPH = "https://graph.instagram.com/v21.0";

interface Ctx {
  channelId: string;
  orgId: string;
  token: string;
}

async function channelCtx(channelId: string): Promise<Ctx> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("channels")
    .select("id, org_id, access_token_ciphertext, token_refreshed_at")
    .eq("id", channelId)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Channel not found");
  let token = getCachedDecryptedToken(channelId);
  if (!token) {
    token = decryptSecret(pgByteaToBuffer(data.access_token_ciphertext as unknown as string));
    setCachedDecryptedToken(channelId, token);
    // The same lazy 30-day refresh the DM path runs; never blocks the send.
    refreshIgTokenIfStale({
      channelId,
      orgId: data.org_id as string,
      token,
      refreshedAt: (data.token_refreshed_at as string | null) ?? null,
    }).catch(() => {});
  }
  return { channelId, orgId: data.org_id as string, token };
}

type GraphCall =
  | { method: "GET"; query?: Record<string, string> }
  | { method: "POST"; body: Record<string, unknown> };

async function graph<T = unknown>(ctx: Ctx, path: string, call: GraphCall): Promise<T> {
  const url = new URL(`${GRAPH}/${path}`);
  let res: Response;
  if (call.method === "GET") {
    for (const [k, v] of Object.entries(call.query ?? {})) url.searchParams.set(k, v);
    url.searchParams.set("access_token", ctx.token);
    res = await fetch(url);
  } else {
    // Same as sendInstagramText: the token goes in the JSON body.
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...call.body, access_token: ctx.token }),
    });
  }
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number } };
  if (!res.ok || json.error) {
    const code = json.error?.code;
    const message = `${json.error?.message ?? res.statusText}${code ? ` (code ${code})` : ""}`;
    if (code === 190 || isTokenError(message)) {
      invalidateCachedDecryptedToken(ctx.channelId);
      await markChannelUnhealthy({
        channelId: ctx.channelId,
        orgId: ctx.orgId,
        platform: "instagram",
        error: message,
      }).catch(() => {});
    }
    throw new Error(message);
  }
  return json as T;
}

export function createMeta(): CommentDmMeta {
  return {
    async replyToComment(channelId, commentId, text) {
      const ctx = await channelCtx(channelId);
      await graph(ctx, `${encodeURIComponent(commentId)}/replies`, { method: "POST", body: { message: text } });
    },

    async sendPrivateReply(channelId, commentId, msg) {
      const ctx = await channelCtx(channelId);
      const res = await graph<{ recipient_id?: string; message_id?: string }>(ctx, "me/messages", {
        method: "POST",
        body: { recipient: { comment_id: commentId }, message: templateMessage(msg) },
      });
      return { messageId: res.message_id, recipientId: res.recipient_id };
    },

    async sendButtonMessage(channelId, recipientId, msg) {
      const ctx = await channelCtx(channelId);
      const res = await graph<{ recipient_id?: string; message_id?: string }>(ctx, "me/messages", {
        method: "POST",
        body: { recipient: { id: recipientId }, message: templateMessage(msg) },
      });
      return { messageId: res.message_id, recipientId: res.recipient_id };
    },

    async checkFollows(channelId, igsid): Promise<FollowResult> {
      try {
        const ctx = await channelCtx(channelId);
        const res = await graph<{ is_user_follow_business?: unknown }>(ctx, encodeURIComponent(igsid), {
          method: "GET",
          query: { fields: "is_user_follow_business" },
        });
        if (typeof res.is_user_follow_business !== "boolean") {
          return { ok: false, error: "follow status missing from Instagram's answer" };
        }
        return { ok: true, follows: res.is_user_follow_business };
      } catch (err) {
        return { ok: false, error: (err as Error).message.slice(0, 200) };
      }
    },
  };
}
```

- [ ] **Step 6: Write index.ts**

`src/lib/comment-dm/index.ts`:

```ts
import "server-only";
import { handleComment, handleTap } from "./flow";
import { createMeta } from "./meta";
import { createStore } from "./store";
import type { CommentDmDeps, CommentEvent, TapEvent } from "./types";

function realDeps(): CommentDmDeps {
  return { store: createStore(), meta: createMeta() };
}

/** Run each new comment through the flow. One bad comment never stops the rest. */
export async function processCommentEvents(events: CommentEvent[]): Promise<void> {
  if (events.length === 0) return;
  const deps = realDeps();
  for (const ev of events) {
    try {
      const outcome = await handleComment(ev, deps);
      console.log(`[comment-dm] comment ${ev.commentId} on ${ev.mediaId}: ${outcome}`);
    } catch (err) {
      console.error(`[comment-dm] comment ${ev.commentId} failed`, err);
    }
  }
}

/** Run each button tap through the flow. One bad tap never stops the rest. */
export async function processTapEvents(events: TapEvent[]): Promise<void> {
  if (events.length === 0) return;
  const deps = realDeps();
  for (const ev of events) {
    try {
      const outcome = await handleTap(ev, deps);
      console.log(`[comment-dm] tap ${ev.mid}: ${outcome}`);
    } catch (err) {
      console.error(`[comment-dm] tap ${ev.mid} failed`, err);
    }
  }
}
```

- [ ] **Step 7: Typecheck, lint, test**

Run: `npm run typecheck && npx eslint src/lib/comment-dm && npm test`
Expected: no type errors, no lint errors, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/comment-dm/templates.ts src/lib/comment-dm/meta.ts src/lib/comment-dm/index.ts tests/comment-dm-templates.test.ts
git commit -m "Call Instagram for public replies, private replies, button DMs and the follow check" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Wire it into the Instagram webhook

**Files:**
- Modify: `src/app/api/webhooks/instagram/route.ts`

- [ ] **Step 1: Add the imports**

In `src/app/api/webhooks/instagram/route.ts`, replace:

```ts
import { logWebhookDebug } from "@/lib/channels/debug-log";
```

with:

```ts
import { logWebhookDebug } from "@/lib/channels/debug-log";
import { parseCommentEvents, parseTapEvents } from "@/lib/comment-dm/parse";
import { processCommentEvents, processTapEvents } from "@/lib/comment-dm";
```

- [ ] **Step 2: Parse all three kinds of event**

Replace:

```ts
  const messages = parseInstagramWebhook(body);

  if (messages.length === 0) {
    logWebhookDebug({
      platform: "instagram", method: "POST", statusCode: 200,
      parsedCount: 0, rawBody: raw, error: "no parseable messages (may be a non-message event)",
    });
    return NextResponse.json({ ok: true });
  }

  const firstPageId = messages[0]!.pageId;
```

with:

```ts
  const messages = parseInstagramWebhook(body);
  const comments = parseCommentEvents(body);
  const taps = parseTapEvents(body);
  const parsedCount = messages.length + comments.length + taps.length;

  if (parsedCount === 0) {
    logWebhookDebug({
      platform: "instagram", method: "POST", statusCode: 200,
      parsedCount: 0, rawBody: raw, error: "no parseable messages (may be a non-message event)",
    });
    return NextResponse.json({ ok: true });
  }

  // Any event in the delivery names the account; they all come from one app.
  const firstPageId = messages[0]?.pageId ?? comments[0]?.accountId ?? taps[0]!.accountId;
```

- [ ] **Step 3: Count every event in the debug log**

Replace every occurrence (3) of `parsedCount: messages.length` with `parsedCount` (Edit with `replace_all: true`).

- [ ] **Step 4: Scope the new events to the signing org**

Replace:

```ts
  const scoped = await scopeToSigningOrg(messages, (m) => m.pageId, "instagram", creds ? orgId : null);
```

with:

```ts
  const signingOrg = creds ? orgId : null;
  const scoped = await scopeToSigningOrg(messages, (m) => m.pageId, "instagram", signingOrg);
  const scopedComments = await scopeToSigningOrg(comments, (c) => c.accountId, "instagram", signingOrg);
  const scopedTaps = await scopeToSigningOrg(taps, (t) => t.accountId, "instagram", signingOrg);
```

- [ ] **Step 5: Dispatch them in the background step**

Replace:

```ts
    } catch (err) {
      console.error("[instagram webhook] background processing failed", err);
    }
  });
```

with:

```ts
    } catch (err) {
      console.error("[instagram webhook] background processing failed", err);
    }

    // Comment-to-DM: new comments and button taps. Each event is isolated inside.
    await processCommentEvents(scopedComments).catch((err) =>
      console.error("[instagram webhook] comment-dm comments failed", err),
    );
    await processTapEvents(scopedTaps).catch((err) =>
      console.error("[instagram webhook] comment-dm taps failed", err),
    );
  });
```

- [ ] **Step 6: Typecheck, lint, test**

Run: `npm run typecheck && npx eslint src/app/api/webhooks/instagram && npm test`
Expected: no type errors, no lint errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/webhooks/instagram/route.ts
git commit -m "Send Instagram comments and button taps to Comment-to-DM" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Save granted scopes when an account connects

**Files:**
- Modify: `src/lib/auth/oauth-state.ts:16-23`
- Modify: `src/app/api/meta/ig-oauth/callback/route.ts`
- Modify: `src/app/app/[orgId]/channels/subscribe-ig/route.ts`

- [ ] **Step 1: Add the state fields**

In `src/lib/auth/oauth-state.ts`, replace:

```ts
  flow?: "ig" | "fb" | "wa";
}
```

with:

```ts
  flow?: "ig" | "fb" | "wa";
  /** Instagram only: also ask for comment access (instagram_business_manage_comments). */
  withComments?: boolean;
  /** Instagram only: land on the Comment to DM page after connecting. */
  returnTo?: "comment-dm";
}
```

`verifyState` returns the decoded object as is, so the new fields pass through.

- [ ] **Step 2: Callback — imports and state**

In `src/app/api/meta/ig-oauth/callback/route.ts`, replace:

```ts
import { verifyState } from "@/lib/auth/oauth-state";
```

with:

```ts
import { verifyState } from "@/lib/auth/oauth-state";
import {
  hasCommentAccess,
  igSubscribedFields,
  parseGrantedScopes,
  requestedIgScopes,
} from "@/lib/channels/ig-scopes";
```

and replace:

```ts
  const orgId = decoded.orgId;

  const ctx = await requireOrgMember(orgId);
```

with:

```ts
  const orgId = decoded.orgId;
  const withComments = decoded.withComments === true;

  const ctx = await requireOrgMember(orgId);
```

- [ ] **Step 3: Callback — read the granted scopes**

Replace:

```ts
    permissions?: string[];
```

with:

```ts
    permissions?: unknown;
```

and replace:

```ts
  if (!tokenJson.user_id) {
    return redirectBack(req, orgId, "error", `Step 1: no user_id in response`);
  }
```

with:

```ts
  if (!tokenJson.user_id) {
    return redirectBack(req, orgId, "error", `Step 1: no user_id in response`);
  }

  // What the person actually allowed. If Meta leaves it out, assume what we asked for.
  const grantedScopes = parseGrantedScopes(tokenJson.permissions) ?? requestedIgScopes(withComments);
```

- [ ] **Step 4: Callback — subscribe to the right fields**

Replace:

```ts
      subUrl.searchParams.set("subscribed_fields", "messages");
```

with:

```ts
      subUrl.searchParams.set("subscribed_fields", igSubscribedFields(grantedScopes));
```

- [ ] **Step 5: Callback — save the scopes, switch off without access, redirect**

Replace:

```ts
  const encrypted = bufferToPgBytea(encryptSecret(accessToken));
  const { error: upErr } = await admin.from("channels").upsert(
    {
      org_id: orgId,
      platform: "instagram",
      external_id: igUserId,
      display_name: username ?? `Instagram (${igUserId})`,
      access_token_ciphertext: encrypted,
      status: "active",
    },
    { onConflict: "external_id" },
  );
  if (upErr) {
    return redirectBack(req, orgId, "error", `Step 5 (DB): ${upErr.message}`);
  }

  await admin.from("audit_logs").insert({
    org_id: orgId,
    action: "instagram_connected",
    payload: { username: username ?? null, user_id: igUserId },
  }).then(() => {});

  return redirectBack(req, orgId, "success", username ? `@${username}` : `user ${igUserId}`);
```

with:

```ts
  const encrypted = bufferToPgBytea(encryptSecret(accessToken));
  const { data: saved, error: upErr } = await admin
    .from("channels")
    .upsert(
      {
        org_id: orgId,
        platform: "instagram",
        external_id: igUserId,
        display_name: username ?? `Instagram (${igUserId})`,
        access_token_ciphertext: encrypted,
        status: "active",
        granted_scopes: grantedScopes,
      },
      { onConflict: "external_id" },
    )
    .select("id")
    .single();
  if (upErr || !saved) {
    return redirectBack(req, orgId, "error", `Step 5 (DB): ${upErr?.message ?? "no channel row returned"}`);
  }
  const channelId = saved.id as string;

  // Without comment access Comment to DM can't work: switch it off so its page says why.
  if (!hasCommentAccess(grantedScopes)) {
    await admin
      .from("comment_dm_settings")
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq("channel_id", channelId);
  }

  await admin.from("audit_logs").insert({
    org_id: orgId,
    action: "instagram_connected",
    payload: { username: username ?? null, user_id: igUserId, scopes: grantedScopes },
  }).then(() => {});

  if (decoded.returnTo === "comment-dm") {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    const url = new URL(`/app/${orgId}/channels/comment-dm/${channelId}`, base);
    if (hasCommentAccess(grantedScopes)) url.searchParams.set("connected", "1");
    else url.searchParams.set("error", "Instagram didn't allow comment access. Try again and keep access to comments allowed.");
    return NextResponse.redirect(url);
  }

  return redirectBack(req, orgId, "success", username ? `@${username}` : `user ${igUserId}`);
```

- [ ] **Step 6: subscribe-ig uses the stored scopes**

In `src/app/app/[orgId]/channels/subscribe-ig/route.ts`, replace:

```ts
import { decryptSecret, pgByteaToBuffer } from "@/lib/crypto/secrets";
```

with:

```ts
import { decryptSecret, pgByteaToBuffer } from "@/lib/crypto/secrets";
import { igSubscribedFields } from "@/lib/channels/ig-scopes";
```

replace:

```ts
    .select("external_id, access_token_ciphertext")
```

with:

```ts
    .select("external_id, access_token_ciphertext, granted_scopes")
```

and replace:

```ts
      url.searchParams.set("subscribed_fields", "messages");
```

with:

```ts
      url.searchParams.set("subscribed_fields", igSubscribedFields(channel.granted_scopes as string[] | null));
```

- [ ] **Step 7: Typecheck and lint**

Run: `npm run typecheck && npx eslint src/lib/auth/oauth-state.ts src/app/api/meta/ig-oauth "src/app/app/[orgId]/channels/subscribe-ig"`
Expected: no type errors, no lint errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/auth/oauth-state.ts src/app/api/meta/ig-oauth/callback/route.ts "src/app/app/[orgId]/channels/subscribe-ig/route.ts"
git commit -m "Remember which Instagram permissions an account granted" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Comment to DM on the Channels page

**Files:**
- Modify: `src/app/app/[orgId]/channels/page.tsx`

- [ ] **Step 1: Import the helpers**

Replace:

```tsx
import { signState } from "@/lib/auth/oauth-state";
```

with:

```tsx
import { signState } from "@/lib/auth/oauth-state";
import { buildIgLoginUrl, hasCommentAccess, pickIgAppId } from "@/lib/channels/ig-scopes";
```

- [ ] **Step 2: Load which channels have it on**

Replace:

```tsx
  const [{ data: channels }, { data: metaSettings }] = await Promise.all([
    admin
      .from("channels")
      .select("id, platform, external_id, display_name, status, last_error, last_error_at, auto_accept_requests, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false }),
    // Per-org app IDs (separate for Instagram vs Facebook).
    admin.from("meta_settings").select("app_id, fb_app_id, ig_app_id").eq("org_id", orgId).maybeSingle(),
  ]);
```

with:

```tsx
  const [{ data: channels }, { data: metaSettings }, { data: commentDmRows }] = await Promise.all([
    admin
      .from("channels")
      .select("id, platform, external_id, display_name, status, last_error, last_error_at, auto_accept_requests, granted_scopes, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false }),
    // Per-org app IDs (separate for Instagram vs Facebook).
    admin.from("meta_settings").select("app_id, fb_app_id, ig_app_id").eq("org_id", orgId).maybeSingle(),
    admin.from("comment_dm_settings").select("channel_id").eq("org_id", orgId).eq("enabled", true),
  ]);
  const commentDmOn = new Set((commentDmRows ?? []).map((r) => r.channel_id as string));
  // Once an account has comment access, reconnecting must keep it, or Comment to DM stops.
  const igWithComments = (channels ?? []).some((c) => hasCommentAccess(c.granted_scopes as string[] | null));
```

- [ ] **Step 3: Use the login URL helper**

Replace:

```tsx
  const igAppId =
    (metaSettings?.ig_app_id as string | undefined) ??
    (metaSettings?.app_id as string | undefined) ??
    process.env.META_APP_ID;
  const fbState = signState({ orgId, uid: ctx.userId, flow: "fb" });
  const igState = signState({ orgId, uid: ctx.userId, flow: "ig" });
```

with:

```tsx
  const igAppId = pickIgAppId(metaSettings, process.env.META_APP_ID);
  const fbState = signState({ orgId, uid: ctx.userId, flow: "fb" });
  const igState = signState({ orgId, uid: ctx.userId, flow: "ig", withComments: igWithComments });
```

and replace:

```tsx
  const igLoginUrl =
    igAppId &&
    `https://www.instagram.com/oauth/authorize?` +
      new URLSearchParams({
        enable_fb_login: "0",
        force_authentication: "1",
        client_id: igAppId,
        redirect_uri: `${appUrl}/api/meta/oauth/callback`,
        response_type: "code",
        scope: "instagram_business_basic,instagram_business_manage_messages",
        state: igState,
      }).toString();
```

with:

```tsx
  const igLoginUrl =
    igAppId && buildIgLoginUrl({ appId: igAppId, appUrl, state: igState, withComments: igWithComments });
```

- [ ] **Step 4: Add the row to each Instagram card**

Replace:

```tsx
                <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs space-y-2">
                  <form
                    action={toggleAutoAcceptRequests}
                    className="flex items-center justify-between"
                  >
```

with:

```tsx
                <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-700">Comment to DM</div>
                      <div className="text-[10px] text-slate-500">
                        DM everyone who comments on your posts and send them your link.
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={commentDmOn.has(c.id as string) ? "badge-green" : "badge-gray"}>
                        {commentDmOn.has(c.id as string) ? "On" : "Off"}
                      </span>
                      <a className="btn-ghost btn-sm" href={`/app/${orgId}/channels/comment-dm/${c.id}`}>
                        Set up
                      </a>
                    </div>
                  </div>
                  <form
                    action={toggleAutoAcceptRequests}
                    className="flex items-center justify-between border-t border-slate-200 pt-2"
                  >
```

- [ ] **Step 5: Typecheck, lint, test**

Run: `npm run typecheck && npx eslint "src/app/app/[orgId]/channels/page.tsx" && npm test`
Expected: no type errors, no lint errors, all tests pass (including "the normal login URL is exactly what the Channels page built before").

- [ ] **Step 6: Commit**

```bash
git add "src/app/app/[orgId]/channels/page.tsx"
git commit -m "Show Comment to DM on each Instagram channel" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: The Comment to DM settings page

**Files:**
- Create: `src/app/app/[orgId]/channels/comment-dm/[channelId]/actions.ts`
- Create: `src/app/app/[orgId]/channels/comment-dm/[channelId]/TextFields.tsx`
- Create: `src/app/app/[orgId]/channels/comment-dm/[channelId]/page.tsx`

- [ ] **Step 1: Write the server actions**

`src/app/app/[orgId]/channels/comment-dm/[channelId]/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrgMember } from "@/lib/auth/guards";
import { hasCommentAccess } from "@/lib/channels/ig-scopes";
import { compactTexts, parseSettingsForm } from "@/lib/comment-dm/texts";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const RefSchema = z.object({
  orgId: z.string().uuid(),
  channelId: z.string().uuid(),
});

function pagePath(orgId: string, channelId: string): string {
  return `/app/${orgId}/channels/comment-dm/${channelId}`;
}

function backWithError(orgId: string, channelId: string, message: string): never {
  redirect(`${pagePath(orgId, channelId)}?error=${encodeURIComponent(message)}`);
}

// The admin client bypasses RLS: prove the channel belongs to the org the caller was checked against.
async function requireOwnerChannel(orgId: string, channelId: string) {
  const ctx = await requireOrgMember(orgId);
  if (ctx.role !== "owner") throw new Error("Only owners can change Comment to DM");
  const admin = createSupabaseAdminClient();
  const { data: channel } = await admin
    .from("channels")
    .select("id, platform, granted_scopes")
    .eq("id", channelId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!channel || channel.platform !== "instagram") throw new Error("Channel not found");
  return { ctx, admin, channel };
}

export async function saveCommentDmSettings(formData: FormData) {
  const ref = RefSchema.parse({ orgId: formData.get("orgId"), channelId: formData.get("channelId") });
  const { ctx, admin } = await requireOwnerChannel(ref.orgId, ref.channelId);

  const parsed = parseSettingsForm((name) => formData.get(name));
  if (!parsed.success) {
    backWithError(ref.orgId, ref.channelId, parsed.error.issues[0]?.message ?? "Check the form and try again.");
  }
  const s = parsed.data;

  const { data: current } = await admin
    .from("comment_dm_settings")
    .select("enabled")
    .eq("channel_id", ref.channelId)
    .maybeSingle();
  if (current?.enabled && !s.linkUrl) {
    backWithError(ref.orgId, ref.channelId, "Comment to DM is on, so it needs a link. Add one, or turn it off first.");
  }

  const { error } = await admin.from("comment_dm_settings").upsert(
    {
      channel_id: ref.channelId,
      org_id: ref.orgId,
      link_url: s.linkUrl || null,
      default_language: s.defaultLanguage,
      require_follow: s.requireFollow,
      public_reply_enabled: s.publicReplyEnabled,
      texts: compactTexts(s.texts),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "channel_id" },
  );
  if (error) throw new Error(error.message);

  await admin.from("audit_logs").insert({
    org_id: ref.orgId,
    user_id: ctx.userId,
    action: "comment_dm_settings_saved",
    payload: { channel_id: ref.channelId },
  });
  revalidatePath(pagePath(ref.orgId, ref.channelId));
  redirect(`${pagePath(ref.orgId, ref.channelId)}?saved=1`);
}

export async function setCommentDmEnabled(formData: FormData) {
  const parsed = RefSchema.extend({ enabled: z.enum(["true", "false"]) }).parse({
    orgId: formData.get("orgId"),
    channelId: formData.get("channelId"),
    enabled: formData.get("enabled"),
  });
  const { ctx, admin, channel } = await requireOwnerChannel(parsed.orgId, parsed.channelId);
  const enable = parsed.enabled === "true";

  if (enable) {
    if (!hasCommentAccess(channel.granted_scopes as string[] | null)) {
      backWithError(parsed.orgId, parsed.channelId, "Reconnect this account and allow comment access first.");
    }
    const { data: saved } = await admin
      .from("comment_dm_settings")
      .select("link_url")
      .eq("channel_id", parsed.channelId)
      .maybeSingle();
    if (!saved?.link_url) {
      backWithError(parsed.orgId, parsed.channelId, "Add your link and save before turning this on.");
    }
  }

  const { error } = await admin.from("comment_dm_settings").upsert(
    { channel_id: parsed.channelId, org_id: parsed.orgId, enabled: enable, updated_at: new Date().toISOString() },
    { onConflict: "channel_id" },
  );
  if (error) throw new Error(error.message);

  await admin.from("audit_logs").insert({
    org_id: parsed.orgId,
    user_id: ctx.userId,
    action: enable ? "comment_dm_enabled" : "comment_dm_disabled",
    payload: { channel_id: parsed.channelId },
  });
  revalidatePath(pagePath(parsed.orgId, parsed.channelId));
  revalidatePath(`/app/${parsed.orgId}/channels`);
  redirect(pagePath(parsed.orgId, parsed.channelId));
}
```

- [ ] **Step 2: Write the text fields**

`src/app/app/[orgId]/channels/comment-dm/[channelId]/TextFields.tsx`:

```tsx
import { resolveTexts, TEXT_LABELS, TEXT_LIMITS, textFieldName } from "@/lib/comment-dm/texts";
import { TEXT_KEYS, type SavedTexts, type TextKey } from "@/lib/comment-dm/types";

// Button labels and the public reply are one line; the DMs get a textarea.
const ONE_LINE: ReadonlySet<TextKey> = new Set<TextKey>(["publicReply", "openingButton", "followedButton", "linkButton"]);

export function TextFields({ saved }: { saved: SavedTexts }) {
  const en = resolveTexts(saved, "en");
  const ar = resolveTexts(saved, "ar");
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Messages</h3>
        <p className="text-[10px] text-slate-400">
          People get the English or Arabic version, matching their comment. Clear a field to go back to the default.
        </p>
      </div>
      {TEXT_KEYS.map((key) => (
        <div key={key} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label={`${TEXT_LABELS[key]} · English`} name={textFieldName("en", key)} value={en[key]} textKey={key} />
          <Field label={`${TEXT_LABELS[key]} · العربية`} name={textFieldName("ar", key)} value={ar[key]} textKey={key} rtl />
        </div>
      ))}
    </div>
  );
}

function Field({ label, name, value, textKey, rtl }: { label: string; name: string; value: string; textKey: TextKey; rtl?: boolean }) {
  const props = {
    className: ONE_LINE.has(textKey) ? "input" : "input min-h-[72px]",
    id: name,
    name,
    defaultValue: value,
    maxLength: TEXT_LIMITS[textKey],
    dir: rtl ? "rtl" : undefined,
  };
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      {ONE_LINE.has(textKey) ? <input {...props} /> : <textarea {...props} />}
    </div>
  );
}
```

- [ ] **Step 3: Write the page**

`src/app/app/[orgId]/channels/comment-dm/[channelId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { requireOrgMember } from "@/lib/auth/guards";
import { signState } from "@/lib/auth/oauth-state";
import { buildIgLoginUrl, hasCommentAccess, pickIgAppId } from "@/lib/channels/ig-scopes";
import { getCommentDmOverview } from "@/lib/comment-dm/overview";
import { settingsOrDefaults } from "@/lib/comment-dm/store";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { IconArrowLeft } from "@/components/icons";
import { saveCommentDmSettings, setCommentDmEnabled } from "./actions";
import { TextFields } from "./TextFields";

export const dynamic = "force-dynamic";

export default async function CommentDmPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string; channelId: string }>;
  searchParams: Promise<{ saved?: string; connected?: string; error?: string }>;
}) {
  const { orgId, channelId } = await params;
  const { saved, connected, error } = await searchParams;
  const ctx = await requireOrgMember(orgId);
  const isOwner = ctx.role === "owner";
  const admin = createSupabaseAdminClient();

  const [{ data: channel }, { data: settingsRow }, { data: metaSettings }] = await Promise.all([
    admin
      .from("channels")
      .select("id, platform, display_name, external_id, granted_scopes")
      .eq("id", channelId)
      .eq("org_id", orgId)
      .maybeSingle(),
    admin.from("comment_dm_settings").select("*").eq("channel_id", channelId).eq("org_id", orgId).maybeSingle(),
    admin.from("meta_settings").select("app_id, ig_app_id").eq("org_id", orgId).maybeSingle(),
  ]);
  if (!channel || channel.platform !== "instagram") notFound();

  const settings = settingsOrDefaults(settingsRow, channelId, orgId);
  const overview = await getCommentDmOverview(channelId);
  const commentAccess = hasCommentAccess(channel.granted_scopes as string[] | null);
  const name = (channel.display_name as string | null) ?? (channel.external_id as string);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inboxweave.com";
  const igAppId = pickIgAppId(metaSettings, process.env.META_APP_ID);
  const reconnectUrl =
    isOwner && igAppId
      ? buildIgLoginUrl({
          appId: igAppId,
          appUrl,
          withComments: true,
          state: signState({ orgId, uid: ctx.userId, flow: "ig", withComments: true, returnTo: "comment-dm" }),
        })
      : null;

  const counts = [
    { label: "DMs sent", value: overview.dmsSent },
    { label: "Links sent", value: overview.linksSent },
    { label: "Waiting on a follow", value: overview.awaitingFollow },
    { label: "Failed", value: overview.failed },
  ];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <a
        href={`/app/${orgId}/channels`}
        className="mb-3 inline-flex items-center gap-1 text-xs text-slate-400 transition-colors hover:text-slate-600"
      >
        <IconArrowLeft className="h-3 w-3" /> Channels
      </a>
      <div className="page-header">
        <h1>Comment to DM</h1>
        <p>
          When someone comments on any post or reel of <strong>{name}</strong>, reply under the comment and DM them a
          button. Tapping it sends your link, once they follow you.
        </p>
      </div>

      {saved && <Banner tone="green">Saved.</Banner>}
      {connected && <Banner tone="green">Comment access allowed. Add your link, then turn Comment to DM on.</Banner>}
      {error && <Banner tone="red">{error}</Banner>}

      {!commentAccess && (
        <section className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <div className="mb-1 font-semibold">This account needs comment access</div>
          <p className="mb-3 text-amber-800">
            It was connected before Comment to DM existed, or comment access wasn&apos;t allowed. Reconnect it once and
            allow access to comments.
          </p>
          {reconnectUrl ? (
            <a className="btn btn-sm" href={reconnectUrl}>Reconnect to allow comment access</a>
          ) : (
            <p className="text-xs text-amber-800">
              {isOwner ? "Add your Meta app credentials in Settings → Meta first." : "Ask an owner to reconnect it."}
            </p>
          )}
        </section>
      )}

      <section className="card mb-4 flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Comment to DM</h2>
            <span className={settings.enabled ? "badge-green" : "badge-gray"}>{settings.enabled ? "On" : "Off"}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {settings.enabled
              ? "New comments get a public reply and a DM."
              : "Comments are ignored. Save your link, then turn it on."}
          </p>
        </div>
        {isOwner && (
          <form action={setCommentDmEnabled}>
            <input type="hidden" name="orgId" value={orgId} />
            <input type="hidden" name="channelId" value={channelId} />
            <input type="hidden" name="enabled" value={settings.enabled ? "false" : "true"} />
            <button className={settings.enabled ? "btn-ghost btn-sm" : "btn btn-sm"} type="submit">
              {settings.enabled ? "Turn off" : "Turn on"}
            </button>
          </form>
        )}
      </section>

      <form action={saveCommentDmSettings} className="card mb-4">
        <input type="hidden" name="orgId" value={orgId} />
        <input type="hidden" name="channelId" value={channelId} />
        <fieldset disabled={!isOwner} className="space-y-5">
          <div>
            <label className="label" htmlFor="linkUrl">Your link</label>
            <input
              className="input"
              id="linkUrl"
              name="linkUrl"
              type="url"
              inputMode="url"
              placeholder="https://"
              defaultValue={settings.linkUrl ?? ""}
              maxLength={2000}
            />
            <p className="mt-1 text-[10px] text-slate-400">
              What people get when they tap the button. Must start with https://
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="defaultLanguage">Default language</label>
              <select className="input" id="defaultLanguage" name="defaultLanguage" defaultValue={settings.defaultLanguage}>
                <option value="en">English</option>
                <option value="ar">العربية (Arabic)</option>
              </select>
              <p className="mt-1 text-[10px] text-slate-400">For comments with no words, like 🔥🔥</p>
            </div>
            <Toggle name="requireFollow" checked={settings.requireFollow} title="Require follow" hint="Only followers get the link" />
            <Toggle
              name="publicReplyEnabled"
              checked={settings.publicReplyEnabled}
              title="Reply under the comment"
              hint="Tells them to check their DMs"
            />
          </div>
          <TextFields saved={settings.texts} />
          {isOwner && <button className="btn" type="submit">Save</button>}
        </fieldset>
      </form>

      <section className="card">
        <h2 className="mb-3 font-semibold">Results</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {counts.map((c) => (
            <div key={c.label} className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-xl font-bold">{c.value}</div>
              <div className="text-[10px] text-slate-500">{c.label}</div>
            </div>
          ))}
        </div>
        {overview.recentFailures.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-xs font-semibold text-slate-500">Latest failures</h3>
            <ul className="space-y-1.5 text-xs">
              {overview.recentFailures.map((f) => (
                <li key={f.id}>
                  <strong>{f.commenterUsername ? `@${f.commenterUsername}` : "Someone"}</strong>
                  {" — "}
                  <span className="font-mono text-slate-600">{f.error ?? "unknown error"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}

function Banner({ tone, children }: { tone: "green" | "red"; children: React.ReactNode }) {
  const colors =
    tone === "green" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800";
  return <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${colors}`}>{children}</div>;
}

function Toggle({ name, checked, title, hint }: { name: string; checked: boolean; title: string; hint: string }) {
  return (
    <label className="flex items-start gap-2 pt-6 text-sm">
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-0.5" />
      <span>
        <span className="font-medium">{title}</span>
        <span className="block text-[10px] text-slate-500">{hint}</span>
      </span>
    </label>
  );
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npx eslint "src/app/app/[orgId]/channels/comment-dm"`
Expected: no type errors, no lint errors.

- [ ] **Step 5: Look at it in the browser**

Use the `run` skill to start the app. Sign in as an owner and open `/app/<orgId>/channels/comment-dm/<instagramChannelId>`. Check that:
- the amber "needs comment access" card shows for an account connected before this feature;
- all 7 texts show in English and Arabic, with the Arabic inputs right-to-left;
- saving `http://x.com` shows the red "The link must start with https://" banner;
- saving a valid `https://` link shows "Saved." and keeps the value;
- "Turn on" without comment access shows "Reconnect this account and allow comment access first.";
- at 375px wide the page doesn't scroll sideways.

Signing in needs the user's account. If you can't, say so and leave this check to Task 16.

- [ ] **Step 6: Commit**

```bash
git add "src/app/app/[orgId]/channels/comment-dm"
git commit -m "Add the Comment to DM settings page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Full checks

**Files:** none new

- [ ] **Step 1: Tests**

Run: `npm test`
Expected: all tests pass. The new files add about 60 tests to the existing 59.

- [ ] **Step 2: Types**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Lint the files this branch touched**

Run:

```bash
npx eslint scripts/verify-comment-dm.mjs src/lib/comment-dm src/lib/channels/ig-scopes.ts src/lib/channels/language.ts src/lib/channels/commands.ts src/lib/auth/oauth-state.ts src/app/api/webhooks/instagram src/app/api/meta/ig-oauth "src/app/app/[orgId]/channels" tests/language.test.ts tests/ig-scopes.test.ts tests/comment-dm-*.test.ts tests/helpers
```

Expected: no errors. Warnings that were already there are fine.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: the build completes. If it fails, run the same build on `main` (`git stash; git checkout main; npm run build; git checkout -; git stash pop`) before blaming this branch, and report what you find.

- [ ] **Step 5: Commit any fixes**

If steps 1–4 needed fixes, commit them:

```bash
git add -A
git commit -m "Fix issues found by the full checks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: End-to-end on a real account (needs the user)

Meta sends webhooks to the production URL, so this runs after migration 0021 is applied **and** the code is deployed. Ask the user how they want to deploy (merge to `main`, or point a test Meta app at a tunnel). Don't deploy without their go-ahead.

- [ ] **Step 1:** Confirm migration 0021 is applied (Task 8), then deploy.
- [ ] **Step 2:** Open **Channels → Instagram card → Comment to DM: Set up**, click **Reconnect to allow comment access**, and allow comments. Expect the green "Comment access allowed" banner. In the SQL editor, `select granted_scopes from channels where id = '<channelId>';` should include `instagram_business_manage_comments`. This answers the open question about the format of `permissions`.
- [ ] **Step 3:** Save a link and turn it on. The Channels card shows **On**.
- [ ] **Step 4:** From a second account, comment `كم السعر؟` on a post → an Arabic public reply plus an Arabic DM with a button.
- [ ] **Step 5:** On another post, comment `price?` → English. On a third, comment `🔥🔥` → the default language.
- [ ] **Step 6:** Tap the button while **not** following → the follow-first message with **I followed ✅**. Follow, tap it → the link with **Open link**.
- [ ] **Step 7:** Comment again on the same post → nothing new.
- [ ] **Step 8:** The InboxWeave inbox shows the thread: the first DM, the taps, the replies. The settings page counts match.
- [ ] **Step 9:** Turn it off, comment on another post → nothing.
- [ ] **Step 10:** Then use superpowers:finishing-a-development-branch.
