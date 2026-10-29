import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeTwilioSignature,
  verifyTwilioSignature,
} from "../src/lib/channels/twilio-signature.ts";

// Twilio's documented example (docs/usage/security).
const AUTH_TOKEN = "12345";
const URL = "https://mycompany.com/myapp.php?foo=1&bar=2";
const PARAMS: [string, string][] = [
  ["Digits", "1234"],
  ["To", "+18005551212"],
  ["From", "+12349013030"],
  ["Caller", "+12349013030"],
  ["CallSid", "CA1234567890ABCDE"],
];
const EXPECTED = "0/KCTR6DLpKmkAf8muzZqo1nDgQ=";

test("computes Twilio's documented example signature", () => {
  assert.equal(computeTwilioSignature(AUTH_TOKEN, URL, PARAMS), EXPECTED);
});

test("param order does not matter", () => {
  const reversed = [...PARAMS].reverse();
  assert.equal(computeTwilioSignature(AUTH_TOKEN, URL, reversed), EXPECTED);
});

test("accepts URLSearchParams entries", () => {
  const body = new URLSearchParams(PARAMS);
  assert.equal(verifyTwilioSignature(AUTH_TOKEN, URL, body.entries(), EXPECTED), true);
});

test("rejects missing, malformed or wrong signatures", () => {
  assert.equal(verifyTwilioSignature(AUTH_TOKEN, URL, PARAMS, null), false);
  assert.equal(verifyTwilioSignature(AUTH_TOKEN, URL, PARAMS, ""), false);
  assert.equal(verifyTwilioSignature(AUTH_TOKEN, URL, PARAMS, "short"), false);
  assert.equal(verifyTwilioSignature(AUTH_TOKEN, URL, PARAMS, "1/KCTR6DLpKmkAf8muzZqo1nDgQ="), false);
});

test("rejects tampered params, url or token", () => {
  const tampered: [string, string][] = PARAMS.map(([k, v]) => [k, k === "To" ? "+19995551212" : v]);
  assert.equal(verifyTwilioSignature(AUTH_TOKEN, URL, tampered, EXPECTED), false);
  assert.equal(verifyTwilioSignature(AUTH_TOKEN, "https://evil.example/myapp.php?foo=1&bar=2", PARAMS, EXPECTED), false);
  assert.equal(verifyTwilioSignature("54321", URL, PARAMS, EXPECTED), false);
  assert.equal(verifyTwilioSignature("", URL, PARAMS, EXPECTED), false);
});
