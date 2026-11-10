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
