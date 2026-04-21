import { readFileSync } from "node:fs";
import { createDecipheriv } from "node:crypto";
import pg from "pg";

function loadEnv(name) {
  try {
    const content = readFileSync(name, "utf8");
    for (const line of content.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 1) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {}
}
loadEnv(".env");

const [, , password, orgId] = process.argv;
if (!password || !orgId) {
  console.error("Usage: node scripts/test-typing.mjs <db-password> <org-id>");
  process.exit(1);
}

const key = Buffer.from(process.env.SECRETS_ENCRYPTION_KEY.trim().replace(/^["']|["']$/g, ""), "hex");
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const c = new pg.Client({
  host: "aws-1-ap-southeast-2.pooler.supabase.com", port: 6543,
  database: "postgres", user: "postgres." + ref,
  password, ssl: { rejectUnauthorized: false },
});
await c.connect();

const r = await c.query(
  "select platform, external_id, access_token_ciphertext, status from public.channels where org_id = $1 and platform = 'instagram'",
  [orgId]
);
if (!r.rows.length) {
  console.error("No IG channel for this org");
  await c.end(); process.exit(1);
}
const row = r.rows[0];
const buf = row.access_token_ciphertext;
console.log("Channel status:", row.status, "| ext id:", row.external_id, "| cipher len:", buf.length);

// Decrypt
const iv = buf.subarray(0, 12);
const tag = buf.subarray(12, 28);
const ct = buf.subarray(28);
const dec = createDecipheriv("aes-256-gcm", key, iv);
dec.setAuthTag(tag);
const token = Buffer.concat([dec.update(ct), dec.final()]).toString("utf8");
console.log("Token prefix:", token.slice(0, 8), "| starts with IGA?", token.startsWith("IGA"));

// Get a recent sender id from a conversation
const conv = await c.query(
  "select contact_external_id from public.conversations where org_id = $1 and channel_id = (select id from public.channels where org_id = $1 and platform='instagram') order by last_message_at desc limit 1",
  [orgId]
);
if (!conv.rows.length) { console.error("No recent conversation"); await c.end(); process.exit(1); }
const recipient = conv.rows[0].contact_external_id;
console.log("Target recipient id:", recipient);

// Fire typing_on via IG Business Login host
const res = await fetch("https://graph.instagram.com/v21.0/me/messages", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    recipient: { id: recipient },
    sender_action: "typing_on",
    access_token: token,
  }),
});
const body = await res.text();
console.log("\nIG typing_on response:", res.status);
console.log(body);

await c.end();
