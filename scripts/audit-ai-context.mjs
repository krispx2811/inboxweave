/**
 * Audit every source that feeds the AI's system prompt.
 *
 * The Knowledge page is only ONE of five inputs to generateReply(). This dumps
 * all of them for a given query so you can see which one carries a stale fact
 * (e.g. an old price) that contradicts the knowledge base.
 *
 * Uses the service-role REST client — no DB password needed.
 *
 * Usage:
 *   node scripts/audit-ai-context.mjs ["<query>"] [org-id]
 *
 * With no org-id it audits every org that has knowledge documents.
 */
import { readFileSync } from "node:fs";
import { createDecipheriv } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

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

const [, , queryArg, orgArg] = process.argv;
const QUERY = queryArg || "how much does it cost? what is the price?";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// ── crypto helpers (mirror src/lib/crypto/secrets.ts) ───────────────────────
function masterKey() {
  const hex = process.env.SECRETS_ENCRYPTION_KEY.trim().replace(/^["']|["']$/g, "");
  return Buffer.from(hex, "hex");
}
function pgByteaToBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value.startsWith("\\x")) return Buffer.from(value.slice(2), "hex");
  if (/^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0)
    return Buffer.from(value, "hex");
  return Buffer.from(value, "base64");
}
function decryptSecret(bundle) {
  const dec = createDecipheriv("aes-256-gcm", masterKey(), bundle.subarray(0, 12));
  dec.setAuthTag(bundle.subarray(12, 28));
  return Buffer.concat([dec.update(bundle.subarray(28)), dec.final()]).toString("utf8");
}

// Anything that looks like money — the values most likely to go stale and
// contradict a freshly uploaded pricing doc.
const MONEY =
  /(?:\b(?:OMR|USD|AED|SAR|KWD|BHD|QAR)\s?[\d][\d,.]*|[\d][\d,.]*\s?(?:OMR|USD|AED|SAR|KWD|BHD|QAR|ريال|ر\.ع)|\$\s?[\d][\d,.]*)/gi;
const CURRENCY = /(OMR|USD|AED|SAR|KWD|BHD|QAR|ريال|ر\.ع|\$)/i;

function flagMoney(text) {
  return [
    ...new Set(
      [...String(text ?? "").matchAll(MONEY)].map((m) =>
        m[0].trim().replace(/\s+/g, " "),
      ),
    ),
  ];
}
const heading = (t) => console.log(`\n${"═".repeat(74)}\n${t}\n${"═".repeat(74)}`);
const one = (t) => String(t ?? "").replace(/\s+/g, " ");

/** Fetch every row of a table for an org, paging past PostgREST's 1000 cap. */
async function fetchAll(table, columns, apply) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(columns).range(from, from + 999);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

async function auditOrg(orgId, orgName) {
  console.log(`\n\n${"█".repeat(74)}`);
  console.log(`ORG: ${orgName ?? "?"}   ${orgId}`);
  console.log("█".repeat(74));

  const found = new Map(); // price value -> Set of source labels
  const record = (source, text) => {
    for (const v of flagMoney(text)) {
      if (!found.has(v)) found.set(v, new Set());
      found.get(v).add(source);
    }
  };

  // ── SOURCE 1: ai_settings.system_prompt ───────────────────────────────────
  heading("SOURCE 1 — Settings → System prompt  (ai_settings.system_prompt)");
  const { data: settings } = await db
    .from("ai_settings")
    .select("system_prompt, model, temperature, ai_enabled")
    .eq("org_id", orgId)
    .maybeSingle();
  if (!settings) {
    console.log("(no ai_settings row — code defaults apply)");
  } else {
    console.log(
      `model=${settings.model}  temperature=${settings.temperature}  ai_enabled=${settings.ai_enabled}`,
    );
    console.log(`length=${(settings.system_prompt ?? "").length} chars\n`);
    console.log(settings.system_prompt);
    record("system_prompt", settings.system_prompt);
    const hits = flagMoney(settings.system_prompt);
    if (hits.length) {
      console.log(`\n⚠️  PRICES HARDCODED IN THE SYSTEM PROMPT: ${hits.join(", ")}`);
      console.log(
        "    This lands BEFORE the knowledge-base block in the system message,\n" +
          "    so the model treats it as its own identity and the KB as reference.",
      );
    }
  }

  // ── SOURCE 4: knowledge base ──────────────────────────────────────────────
  heading("SOURCE 4 — Knowledge page  (knowledge_documents / knowledge_chunks)");
  const docs = await fetchAll(
    "knowledge_documents",
    "id, title, status, content, created_at",
    (q) => q.eq("org_id", orgId).order("created_at", { ascending: false }),
  );
  const chunks = await fetchAll("knowledge_chunks", "document_id, content", (q) =>
    q.eq("org_id", orgId),
  );
  const byDoc = new Map();
  for (const c of chunks) byDoc.set(c.document_id, (byDoc.get(c.document_id) ?? 0) + 1);
  const titleOf = new Map(docs.map((d) => [d.id, d.title]));

  for (const d of docs) {
    console.log(
      `- [${d.status}] ${d.title}  (${byDoc.get(d.id) ?? 0} chunks, ` +
        `${(d.content ?? "").length} chars, ${String(d.created_at).slice(0, 10)})`,
    );
  }

  const orphans = chunks.filter((c) => !titleOf.has(c.document_id));
  if (orphans.length) console.log(`\n⚠️  ${orphans.length} ORPHAN CHUNKS (document deleted)`);

  const pricedDocs = new Set();
  const pricedChunks = chunks.filter((c) => CURRENCY.test(c.content ?? ""));
  console.log(`\n--- chunks mentioning a currency (${pricedChunks.length}) ---`);
  for (const c of pricedChunks) {
    const title = titleOf.get(c.document_id) ?? `(orphan ${c.document_id})`;
    const hits = flagMoney(c.content);
    if (hits.length) {
      pricedDocs.add(title);
      record(`KB:${title}`, c.content);
      console.log(`  "${title}" → ${hits.join(", ")}`);
    }
  }
  if (pricedDocs.size > 1) {
    console.log(
      `\n⚠️  ${pricedDocs.size} DIFFERENT DOCUMENTS CARRY PRICES: ${[...pricedDocs].join(", ")}` +
        "\n    Retrieval searches ALL chunks in the org with no recency weighting,\n" +
        "    so old and new pricing can both land in the same prompt.",
    );
  }

  // ── What retrieval ACTUALLY returns ───────────────────────────────────────
  heading(`RETRIEVAL — what the KB actually returns for: "${QUERY}"`);
  const { data: sec } = await db
    .from("org_secrets")
    .select("openai_api_key_ciphertext")
    .eq("org_id", orgId)
    .maybeSingle();
  if (!sec?.openai_api_key_ciphertext) {
    console.log("(no OpenAI key for this org — skipping live retrieval)");
  } else {
    const apiKey = decryptSecret(pgByteaToBuffer(sec.openai_api_key_ciphertext));
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input: QUERY }),
    });
    if (!res.ok) {
      console.log("embedding failed:", (await res.text()).slice(0, 200));
    } else {
      const embedding = (await res.json()).data[0].embedding;
      const { data: hits, error } = await db.rpc("match_knowledge_chunks_hybrid", {
        p_org_id: orgId,
        p_query: embedding,
        p_query_text: QUERY,
        p_limit: 8,
      });
      if (error) {
        console.log("hybrid RPC failed:", error.message);
      } else {
        console.log(`${hits.length} chunks returned — this is what the AI sees:\n`);
        hits.forEach((h, i) => {
          const money = flagMoney(h.content);
          console.log(
            `[${i + 1}] score=${Number(h.score).toFixed(5)}` +
              (money.length ? `   💰 ${money.join(", ")}` : ""),
          );
          console.log(`    ${one(h.content).slice(0, 300)}\n`);
        });
      }
    }
  }

  // ── SOURCE 2: contact memory ──────────────────────────────────────────────
  heading("SOURCE 2 — Contact memory  (conversations.summary, last 90 days)");
  const ninety = new Date(Date.now() - 90 * 864e5).toISOString();
  const sums = await fetchAll(
    "conversations",
    "contact_name, category, summary, last_message_at",
    (q) =>
      q
        .eq("org_id", orgId)
        .not("summary", "is", null)
        .gte("last_message_at", ninety)
        .order("last_message_at", { ascending: false }),
  );
  let staleSummaries = 0;
  for (const r of sums) {
    const hits = flagMoney(r.summary);
    if (!hits.length) continue;
    staleSummaries++;
    record("contact_memory", r.summary);
    console.log(
      `  [${String(r.last_message_at).slice(0, 10)}] ${r.contact_name ?? "?"} → ${hits.join(", ")}`,
    );
    console.log(`    ${one(r.summary).slice(0, 200)}`);
  }
  console.log(
    staleSummaries
      ? `\n⚠️  ${staleSummaries} of ${sums.length} summaries quote a price. These are injected as\n` +
          '    "You have spoken with this customer before" background for returning contacts.'
      : `(${sums.length} summaries, none quote a price)`,
  );

  // ── SOURCE 5: the AI's own past replies ───────────────────────────────────
  heading("SOURCE 5 — The AI's own past replies  (replayed as history)");
  const { data: past } = await db
    .from("messages")
    .select("conversation_id, content, created_at")
    .eq("org_id", orgId)
    .eq("direction", "out")
    .eq("sender", "ai")
    .gte("created_at", ninety)
    .order("created_at", { ascending: false })
    .limit(1000);
  let quoted = 0;
  const byConvo = new Map();
  for (const r of past ?? []) {
    const hits = flagMoney(r.content);
    if (!hits.length) continue;
    quoted++;
    record("ai_history", r.content);
    for (const h of hits) {
      if (!byConvo.has(h)) byConvo.set(h, new Set());
      byConvo.get(h).add(r.conversation_id);
    }
  }
  for (const [value, convos] of [...byConvo.entries()].sort()) {
    console.log(`  ${value.padEnd(16)} quoted in ${convos.size} conversation(s)`);
  }
  console.log(
    quoted
      ? `\n⚠️  ${quoted} past AI replies quote a price. The last ~20 turns of each thread\n` +
          "    are replayed as assistant messages, so the model stays consistent with\n" +
          "    what it already said — even after you update the knowledge base."
      : "(no past AI replies quote a price)",
  );

  // ── Verdict ───────────────────────────────────────────────────────────────
  heading("VERDICT — every distinct price value, and where it lives");
  if (!found.size) {
    console.log("No price-shaped values found in any source.");
  } else {
    for (const [value, sources] of [...found.entries()].sort())
      console.log(`  ${value.padEnd(18)} ← ${[...sources].join(", ")}`);
    if (found.size > 1)
      console.log(
        "\n⚠️  More than one price value is reachable by the model. Any source above\n" +
          "    other than your current pricing doc is contradicting it.",
      );
  }
}

// ── main ────────────────────────────────────────────────────────────────────
let targets;
if (orgArg) {
  const { data } = await db
    .from("organizations")
    .select("id, name")
    .eq("id", orgArg)
    .maybeSingle();
  targets = data ? [data] : [{ id: orgArg, name: null }];
} else {
  const docs = await fetchAll("knowledge_documents", "org_id");
  const ids = [...new Set(docs.map((d) => d.org_id))];
  const { data } = await db.from("organizations").select("id, name").in("id", ids);
  targets = data ?? [];
  console.log(`Auditing ${targets.length} org(s) with knowledge documents.`);
}

for (const t of targets) await auditOrg(t.id, t.name);
