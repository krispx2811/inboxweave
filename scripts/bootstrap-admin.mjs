/**
 * Bootstrap script: creates a user + makes them platform admin.
 *
 * Usage:
 *   node scripts/bootstrap-admin.mjs <email> <password>
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env or
 * .env.local in the project root.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

// ── Load env from .env / .env.local ───────────────────────────────────────
function loadEnvFile(name) {
  try {
    const content = readFileSync(resolve(process.cwd(), name), "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      // Strip surrounding quotes.
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // File doesn't exist — that's fine.
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env / .env.local");
  process.exit(1);
}

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error("Usage: node scripts/bootstrap-admin.mjs <email> <password>");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log(`\nConnecting to ${url.substring(0, 40)}...`);

// 1. Create the user.
const { data: created, error: createErr } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});

let userId;
if (createErr) {
  if (createErr.message?.includes("already been registered")) {
    console.log(`User ${email} already exists — looking up.`);
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
    userId = list?.users.find((u) => u.email === email)?.id;
    if (!userId) {
      console.error("Could not find existing user");
      process.exit(1);
    }
  } else {
    console.error("Failed to create user:", createErr.message);
    process.exit(1);
  }
} else {
  userId = created.user.id;
  console.log(`Created user ${email} (${userId})`);
}

// 2. Make them a platform admin.
const { error: adminErr } = await admin.from("platform_admins").upsert({ user_id: userId });
if (adminErr) {
  console.error("Failed to insert platform_admins row:", adminErr.message);
  process.exit(1);
}
console.log(`Promoted ${email} to platform admin.`);
console.log(`\nDone. Sign in at http://localhost:3000/login and visit /admin.`);
