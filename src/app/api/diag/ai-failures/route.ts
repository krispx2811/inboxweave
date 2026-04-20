import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { embedText, rawChatCompletion } from "@/lib/ai/openai";
import { retrieveContext } from "@/lib/ai/rag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diagnostic: returns last AI failures + live-tests the RAG + generate pipeline
 * for each of the caller's orgs so we can pinpoint exactly what's broken.
 */
export async function GET() {
  const user = await requireUser();
  const admin = createSupabaseAdminClient();

  const { data: memberships } = await admin
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id);
  const orgIds = (memberships ?? []).map((m) => m.org_id as string);
  if (orgIds.length === 0) return NextResponse.json({ orgs: [], failures: [] });

  const [{ data: failures }, { data: recent }, { data: docs }, { data: chunks }] =
    await Promise.all([
      admin
        .from("audit_logs")
        .select("created_at, action, payload, org_id")
        .in("org_id", orgIds)
        .in("action", ["ai_reply_failed", "ai_auto_disabled", "ai_disabled"])
        .order("created_at", { ascending: false })
        .limit(20),
      admin
        .from("conversations")
        .select("id, contact_name, ai_enabled, is_escalated, last_message_at, org_id")
        .in("org_id", orgIds)
        .order("last_message_at", { ascending: false })
        .limit(10),
      admin
        .from("knowledge_documents")
        .select("id, title, status, error, org_id, created_at")
        .in("org_id", orgIds)
        .order("created_at", { ascending: false }),
      admin
        .from("knowledge_chunks")
        .select("id, document_id, org_id")
        .in("org_id", orgIds),
    ]);

  const chunkCountsByDoc: Record<string, number> = {};
  const chunkCountsByOrg: Record<string, number> = {};
  for (const c of chunks ?? []) {
    chunkCountsByDoc[c.document_id as string] =
      (chunkCountsByDoc[c.document_id as string] ?? 0) + 1;
    chunkCountsByOrg[c.org_id as string] =
      (chunkCountsByOrg[c.org_id as string] ?? 0) + 1;
  }

  const docSummary = (docs ?? []).map((d) => ({
    id: d.id,
    title: d.title,
    status: d.status,
    error: d.error,
    org_id: d.org_id,
    chunks: chunkCountsByDoc[d.id as string] ?? 0,
  }));

  // Detect orphan chunks (document_id not in docs).
  const docIds = new Set((docs ?? []).map((d) => d.id as string));
  const orphanChunks = (chunks ?? []).filter(
    (c) => !docIds.has(c.document_id as string),
  ).length;

  // Live pipeline test for each org.
  const pipelineTests: Array<Record<string, unknown>> = [];
  for (const orgId of orgIds) {
    const test: Record<string, unknown> = { org_id: orgId };
    try {
      const t0 = Date.now();
      const embedding = await embedText(orgId, "test query for diagnostics");
      test.embed = { ok: true, dim: embedding.length, ms: Date.now() - t0 };
    } catch (err) {
      test.embed = { ok: false, error: (err as Error).message };
      pipelineTests.push(test);
      continue;
    }
    try {
      const t0 = Date.now();
      const ctx = await retrieveContext(orgId, "test query for diagnostics");
      test.retrieve = { ok: true, count: ctx.length, ms: Date.now() - t0 };
    } catch (err) {
      test.retrieve = { ok: false, error: (err as Error).message };
    }
    try {
      const t0 = Date.now();
      const out = await rawChatCompletion({
        orgId,
        model: "gpt-4o-mini",
        max_tokens: 20,
        messages: [{ role: "user", content: "say 'ok'" }],
      });
      test.generate = { ok: true, reply: out.slice(0, 50), ms: Date.now() - t0 };
    } catch (err) {
      test.generate = { ok: false, error: (err as Error).message };
    }
    pipelineTests.push(test);
  }

  return NextResponse.json(
    {
      orgs: orgIds,
      failures: failures ?? [],
      recent_conversations: recent ?? [],
      knowledge: {
        docs: docSummary,
        total_chunks_by_org: chunkCountsByOrg,
        orphan_chunks: orphanChunks,
      },
      pipeline_test: pipelineTests,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
