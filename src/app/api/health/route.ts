import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const checks: Record<string, "ok" | "error"> = {};
  let healthy = true;

  // Supabase connectivity.
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("organizations").select("id", { count: "exact", head: true });
    checks.database = error ? "error" : "ok";
    if (error) healthy = false;
  } catch {
    checks.database = "error";
    healthy = false;
  }

  // Env vars present. Meta credentials are now per-org so env vars are
  // optional; only Supabase + encryption key are required.
  checks.env_supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ? "ok" : "error";
  checks.env_secrets = process.env.SECRETS_ENCRYPTION_KEY ? "ok" : "error";
  if (checks.env_supabase === "error" || checks.env_secrets === "error") healthy = false;

  return NextResponse.json(
    {
      status: healthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "0.1.0",
      checks,
    },
    { status: healthy ? 200 : 503 },
  );
}
