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
if (!password) { console.error("Usage: node scripts/backfill-ig-profiles.mjs <db-password>"); process.exit(1); }

const key = Buffer.from(process.env.SECRETS_ENCRYPTION_KEY.trim().replace(/^["']|["']$/g, ""), "hex");
function decryptSecret(bundle) {
  const iv = bundle.subarray(0, 12);
  const tag = bundle.subarray(12, 28);
  const ct = bundle.subarray(28);
  const dec = createDecipheriv("aes-256-gcm", key, iv);
  dec.setAuthTag(tag);
  return Buffer.concat([dec.update(ct), dec.final()]).toString("utf8");
}

const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const c = new pg.Client({
  host: "aws-1-ap-southeast-2.pooler.supabase.com", port: 6543,
  database: "postgres", user: "postgres." + ref,
  password, ssl: { rejectUnauthorized: false },
});
await c.connect();

const channels = await c.query(`
  select id, org_id, access_token_ciphertext
  from public.channels
  where platform = 'instagram' and status = 'active'
`);
console.log(`Enriching IG conversations for ${channels.rows.length} channels...`);

for (const ch of channels.rows) {
  const token = decryptSecret(ch.access_token_ciphertext);
  const convs = await c.query(
    `select id, contact_external_id from public.conversations
     where org_id = $1 and channel_id = $2 and contact_username is null
     order by last_message_at desc`,
    [ch.org_id, ch.id]
  );
  console.log(`  ${convs.rows.length} conversations need enrichment`);
  let done = 0;
  for (const conv of convs.rows) {
    const url = new URL(`https://graph.instagram.com/v21.0/${conv.contact_external_id}`);
    url.searchParams.set("fields", "name,username,profile_pic");
    url.searchParams.set("access_token", token);
    const res = await fetch(url.toString());
    if (!res.ok) { continue; }
    const json = await res.json();
    await c.query(
      `update public.conversations
       set contact_name = $1, contact_username = $2, contact_profile_url = $3
       where id = $4`,
      [json.name ?? null, json.username ?? null, json.profile_pic ?? null, conv.id]
    );
    done++;
    if (done % 10 === 0) console.log(`    ${done}/${convs.rows.length}...`);
  }
  console.log(`  ✓ enriched ${done}/${convs.rows.length}`);
}

await c.end();
