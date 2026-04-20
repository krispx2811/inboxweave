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
  "select access_token_ciphertext from channels where platform='instagram' limit 1",
);
const token = decrypt(r.rows[0].access_token_ciphertext);
await c.end();

console.log("Token:", token.slice(0, 20) + "...");
console.log();

// Test the pattern from the working repo — profile fetch with query-param token
const tests = [
  {
    name: "GET v21.0/me (body-style won't work for GET; use query)",
    method: "GET",
    url: "https://graph.instagram.com/v21.0/me?fields=user_id,username,name,account_type&access_token=" + encodeURIComponent(token),
  },
];

for (const t of tests) {
  const res = await fetch(t.url, { method: t.method });
  const body = await res.text();
  console.log(t.name);
  console.log("  Status:", res.status);
  console.log("  Body:", body.slice(0, 400));
  console.log();
}
