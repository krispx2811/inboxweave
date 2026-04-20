/**
 * Run a Supabase migration by connecting directly via pg.
 * Forces IPv4 DNS lookup to avoid IPv6 issues on some networks.
 *
 * Usage: node scripts/run-migration.mjs <migration-file>
 */

import { readFileSync } from "node:fs";
import { lookup } from "node:dns/promises";
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
      if ((v.startsWith('"') && v.endsWith('"'))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {}
}
loadEnv(".env.local");
loadEnv(".env");

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error("Usage: node scripts/run-migration.mjs <migration-file>");
  process.exit(1);
}

const password = process.argv[3] ?? process.env.SUPABASE_DB_PASSWORD;
if (!password) {
  console.error("Pass DB password as arg 2 or set SUPABASE_DB_PASSWORD in .env");
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!supabaseUrl) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL");
  process.exit(1);
}

const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const directHost = `db.${projectRef}.supabase.co`;

console.log(`Resolving ${directHost} to IPv4...`);
const addr = await lookup(directHost, { family: 4 }).catch((e) => {
  console.error("IPv4 resolve failed:", e.message);
  return null;
});

if (!addr) {
  console.error("Could not resolve IPv4 address for", directHost);
  process.exit(1);
}

console.log(`Connecting to ${addr.address}:5432 as postgres...`);

const client = new pg.Client({
  host: addr.address,
  port: 5432,
  database: "postgres",
  user: "postgres",
  password,
  ssl: { rejectUnauthorized: false, servername: directHost },
  connectionTimeoutMillis: 15000,
});

try {
  await client.connect();
  console.log("Connected.");

  const sql = readFileSync(migrationFile, "utf8");
  console.log(`\nExecuting ${migrationFile} (${sql.length} chars)...`);
  await client.query(sql);
  console.log("✓ Migration applied successfully.");
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
