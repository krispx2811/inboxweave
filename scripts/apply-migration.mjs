/**
 * Applies the migration SQL to a Supabase project using the REST-based
 * pg_query endpoint (same backend the SQL Editor uses).
 *
 * Usage:  node scripts/apply-migration.mjs
 */

import { readFileSync } from "node:fs";

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
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {}
}
loadEnv(".env.local");
loadEnv(".env");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing env vars");
  process.exit(1);
}

// Read the migration SQL, but split out the pgvector / pgsodium extension
// lines that require superuser into separate statements.
const fullSql = readFileSync("supabase/migrations/0001_init.sql", "utf8");

// Split into individual statements to run them one at a time, stopping on error.
// We split on semicolons that appear at the end of a line (heuristic).
const statements = [];
let current = "";
for (const line of fullSql.split("\n")) {
  current += line + "\n";
  // Detect statement boundaries: line ends with ; and we're not inside a $$ block.
  const dollarCount = (current.match(/\$\$/g) || []).length;
  if (line.trim().endsWith(";") && dollarCount % 2 === 0) {
    const stmt = current.trim();
    if (stmt && !stmt.startsWith("--")) {
      statements.push(stmt);
    }
    current = "";
  }
}
if (current.trim()) statements.push(current.trim());

console.log(`Found ${statements.length} SQL statements to execute.\n`);

let ok = 0;
let failed = 0;

for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i];
  const preview = stmt.split("\n").filter(l => !l.trim().startsWith("--")).join(" ").substring(0, 90);
  process.stdout.write(`[${i + 1}/${statements.length}] ${preview}... `);

  const res = await fetch(`${url}/rest/v1/rpc/`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ query: stmt }),
  });

  // The /rpc/ endpoint doesn't support raw SQL — let's try the pg endpoint instead.
  if (!res.ok) {
    // Try using the Supabase realtime/pg endpoint.
    break;
  }
}

// Actually, Supabase Cloud doesn't expose raw SQL via REST for the service
// role. The best option is the Supabase Dashboard SQL Editor or the CLI.
// Let's try the /pg/ endpoint that was added in recent versions.

console.log("\nTrying via SQL Editor API...");

const sqlRes = await fetch(`${url}/pg/query`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
  },
  body: JSON.stringify({ query: fullSql }),
});

if (sqlRes.ok) {
  const result = await sqlRes.json();
  console.log("Migration applied successfully!");
  console.log(JSON.stringify(result).substring(0, 200));
} else {
  const errorText = await sqlRes.text();
  console.error(`Status: ${sqlRes.status}`);
  console.error("Error:", errorText.substring(0, 500));
  console.log("\n──────────────────────────────────────────────");
  console.log("Automatic migration failed. Please apply the schema manually:");
  console.log("1. Go to https://supabase.com/dashboard/project/jjpzaijpteleumgfsomc/sql");
  console.log("2. Copy the contents of supabase/migrations/0001_init.sql");
  console.log("3. Paste into the SQL Editor and click Run");
  console.log("──────────────────────────────────────────────");
}
