import { readFileSync } from "node:fs";
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
loadEnv(".env.local");
loadEnv(".env");

const [, , migrationFile, password, region = "ap-southeast-2"] = process.argv;
if (!migrationFile || !password) {
  console.error("Usage: node scripts/apply-pooler.mjs <migration-file> <db-password> [region]");
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!supabaseUrl) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL");
  process.exit(1);
}
const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const host = `aws-1-${region}.pooler.supabase.com`;
const user = `postgres.${projectRef}`;

console.log(`Connecting to ${host}:6543 as ${user}...`);

const client = new pg.Client({
  host,
  port: 6543,
  database: "postgres",
  user,
  password,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

try {
  await client.connect();
  console.log("Connected.");
  const sql = readFileSync(migrationFile, "utf8");
  console.log(`Executing ${migrationFile} (${sql.length} chars)...`);
  await client.query(sql);
  console.log("✓ Migration applied successfully.");
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
