import pg from "pg";
import { createDecipheriv } from "crypto";
import { readFileSync } from "fs";

function loadEnv(p) {
  try {
    for (const l of readFileSync(p, "utf8").split("\n")) {
      const i = l.indexOf("=");
      if (i < 1 || l.startsWith("#")) continue;
      let v = l.slice(i + 1).trim();
      if (v.startsWith('"')) v = v.slice(1, -1);
      const k = l.slice(0, i).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {}
}
loadEnv(".env");
loadEnv(".env.local");

function decrypt(bundle) {
  const key = Buffer.from(process.env.SECRETS_ENCRYPTION_KEY, "hex");
  const iv = bundle.subarray(0, 12);
  const tag = bundle.subarray(12, 28);
  const ct = bundle.subarray(28);
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}

const c = new pg.Client({
  host: "aws-1-ap-southeast-2.pooler.supabase.com",
  port: 6543, database: "postgres",
  user: "postgres.jjpzaijpteleumgfsomc", password: "Koko2811682099",
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const r = await c.query(
  "select external_id, display_name, access_token_ciphertext from channels where platform='instagram'",
);
for (const row of r.rows) {
  console.log("Channel ID:", row.external_id);
  console.log("Display:", row.display_name);
  const token = decrypt(row.access_token_ciphertext);
  console.log("Token starts with:", token.slice(0, 20) + "...");

  const tries = [
    { name: "Bearer /v22.0/me", url: `https://graph.instagram.com/v22.0/me?fields=user_id,username,account_type`, headers: { Authorization: `Bearer ${token}` } },
    { name: "Bearer /me", url: `https://graph.instagram.com/me?fields=user_id,username,account_type`, headers: { Authorization: `Bearer ${token}` } },
    { name: "Bearer /<id>", url: `https://graph.instagram.com/${row.external_id}?fields=username,account_type`, headers: { Authorization: `Bearer ${token}` } },
    { name: "Bearer /v22.0/<id>", url: `https://graph.instagram.com/v22.0/${row.external_id}?fields=username,account_type`, headers: { Authorization: `Bearer ${token}` } },
  ];
  for (const t of tries) {
    try {
      const res = await fetch(t.url, { headers: t.headers });
      const body = await res.text();
      console.log("\n[" + t.name + "] →", res.status, body.slice(0, 300));
    } catch (e) {
      console.log("err:", e.message);
    }
  }
}
await c.end();
