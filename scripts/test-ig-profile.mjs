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

const password = process.argv[2];
if (!password) { console.error("Usage: node scripts/test-ig-profile.mjs <db-password>"); process.exit(1); }

const key = Buffer.from(process.env.SECRETS_ENCRYPTION_KEY.trim().replace(/^["']|["']$/g, ""), "hex");
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const c = new pg.Client({
  host: "aws-1-ap-southeast-2.pooler.supabase.com", port: 6543,
  database: "postgres", user: "postgres." + ref,
  password, ssl: { rejectUnauthorized: false },
});
await c.connect();

const ch = await c.query(`select access_token_ciphertext, external_id from public.channels where org_id='04faf132-c28b-40ec-ad79-87857aab0cd4' and platform='instagram'`);
const buf = ch.rows[0].access_token_ciphertext;
const iv = buf.subarray(0, 12);
const tag = buf.subarray(12, 28);
const ct = buf.subarray(28);
const dec = createDecipheriv("aes-256-gcm", key, iv);
dec.setAuthTag(tag);
const token = Buffer.concat([dec.update(ct), dec.final()]).toString("utf8");

// Try a couple endpoints against a known IGSID (kareem's)
const igsid = "1354178515615871";
const endpoints = [
  `https://graph.instagram.com/v21.0/${igsid}?fields=name,username,profile_pic`,
  `https://graph.facebook.com/v21.0/${igsid}?fields=name,username,profile_pic`,
  `https://graph.instagram.com/v21.0/${igsid}?fields=name`,
];
for (const url of endpoints) {
  const res = await fetch(`${url}&access_token=${token}`);
  console.log(`\n${url}`);
  console.log(`  ${res.status} →`, (await res.text()).slice(0, 500));
}

await c.end();
