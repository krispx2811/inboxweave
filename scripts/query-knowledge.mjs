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

const [, , password, region = "ap-southeast-2"] = process.argv;
if (!password) {
  console.error("Usage: node scripts/query-knowledge.mjs <db-password> [region]");
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const host = `aws-1-${region}.pooler.supabase.com`;
const user = `postgres.${projectRef}`;

const client = new pg.Client({
  host, port: 6543, database: "postgres", user, password,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

const docs = await client.query(
  `select id, title, status, length(coalesce(content,'')) as content_len, created_at
   from public.knowledge_documents
   order by created_at desc`,
);
console.log("\n=== DOCUMENTS ===");
for (const d of docs.rows) {
  console.log(`- [${d.status}] ${d.title} (id=${d.id}, content=${d.content_len} chars, ${d.created_at.toISOString().slice(0,10)})`);
}

const chunks = await client.query(
  `select document_id, count(*) as n
   from public.knowledge_chunks
   group by document_id`,
);
console.log("\n=== CHUNK COUNTS ===");
for (const c of chunks.rows) {
  console.log(`- doc=${c.document_id} chunks=${c.n}`);
}

// Search chunks for ICL-related text
const iclMatches = await client.query(
  `select kc.document_id, kd.title, substring(kc.content from 1 for 300) as snippet
   from public.knowledge_chunks kc
   join public.knowledge_documents kd on kd.id = kc.document_id
   where kc.content ilike '%ICL%' or kc.content ilike '%implantable%'
   limit 20`,
);
console.log(`\n=== CHUNKS MENTIONING 'ICL' or 'implantable' (${iclMatches.rows.length}) ===`);
for (const r of iclMatches.rows) {
  console.log(`\n--- from "${r.title}" ---`);
  console.log(r.snippet.replace(/\s+/g, " ").slice(0, 280));
}

// Search for "refractive surgery" mentions
const refMatches = await client.query(
  `select kc.document_id, kd.title, substring(kc.content from 1 for 300) as snippet
   from public.knowledge_chunks kc
   join public.knowledge_documents kd on kd.id = kc.document_id
   where kc.content ilike '%refractive%'
   limit 20`,
);
console.log(`\n=== CHUNKS MENTIONING 'refractive' (${refMatches.rows.length}) ===`);
for (const r of refMatches.rows) {
  console.log(`\n--- from "${r.title}" ---`);
  console.log(r.snippet.replace(/\s+/g, " ").slice(0, 280));
}

await client.end();
