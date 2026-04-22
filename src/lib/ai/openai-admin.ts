import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, pgByteaToBuffer } from "@/lib/crypto/secrets";

/**
 * Fetch + decrypt the OpenAI Admin API key stored for an org.
 * Returns null when no admin key is configured (optional feature).
 */
export async function getOpenAIAdminKey(orgId: string): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("org_secrets")
    .select("openai_admin_key_ciphertext")
    .eq("org_id", orgId)
    .maybeSingle();
  if (!data?.openai_admin_key_ciphertext) return null;
  try {
    return decryptSecret(
      pgByteaToBuffer(data.openai_admin_key_ciphertext as unknown as string),
    );
  } catch {
    return null;
  }
}

export interface OpenAICostBucket {
  start_time: number; // unix seconds
  end_time: number;
  amount: { value: number; currency: string };
  line_item: string | null;
  project_id: string | null;
}

export interface OpenAICostResponse {
  object: "page";
  data: Array<{
    object: "bucket";
    start_time: number;
    end_time: number;
    results: Array<{
      object: "organization.costs.result";
      amount: { value: number; currency: string };
      line_item: string | null;
      project_id: string | null;
    }>;
  }>;
  has_more?: boolean;
  next_page?: string | null;
}

export interface OpenAIUsageBucket {
  start_time: number;
  end_time: number;
  input_tokens: number;
  output_tokens: number;
  input_cached_tokens?: number;
  num_model_requests: number;
}

/**
 * Fetch day-bucketed cost data from OpenAI for a given time range.
 * Returns null on any error (including invalid key).
 */
export async function fetchOpenAICosts(params: {
  adminKey: string;
  startUnix: number;
  endUnix: number;
}): Promise<OpenAICostBucket[] | null> {
  const url = new URL("https://api.openai.com/v1/organization/costs");
  url.searchParams.set("start_time", String(params.startUnix));
  url.searchParams.set("end_time", String(params.endUnix));
  url.searchParams.set("bucket_width", "1d");
  url.searchParams.set("limit", "180");

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${params.adminKey}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as OpenAICostResponse;
    const out: OpenAICostBucket[] = [];
    for (const bucket of json.data ?? []) {
      for (const result of bucket.results ?? []) {
        out.push({
          start_time: bucket.start_time,
          end_time: bucket.end_time,
          amount: result.amount,
          line_item: result.line_item,
          project_id: result.project_id,
        });
      }
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Fetch token-usage buckets for completions. Useful to sanity-check that
 * our internal usage_logs match OpenAI's own counters.
 */
export async function fetchOpenAICompletionsUsage(params: {
  adminKey: string;
  startUnix: number;
  endUnix: number;
}): Promise<OpenAIUsageBucket[] | null> {
  const url = new URL("https://api.openai.com/v1/organization/usage/completions");
  url.searchParams.set("start_time", String(params.startUnix));
  url.searchParams.set("end_time", String(params.endUnix));
  url.searchParams.set("bucket_width", "1d");
  url.searchParams.set("limit", "180");

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${params.adminKey}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: Array<{
        start_time: number;
        end_time: number;
        results?: Array<{
          input_tokens?: number;
          output_tokens?: number;
          input_cached_tokens?: number;
          num_model_requests?: number;
        }>;
      }>;
    };
    const out: OpenAIUsageBucket[] = [];
    for (const bucket of json.data ?? []) {
      for (const r of bucket.results ?? []) {
        out.push({
          start_time: bucket.start_time,
          end_time: bucket.end_time,
          input_tokens: r.input_tokens ?? 0,
          output_tokens: r.output_tokens ?? 0,
          input_cached_tokens: r.input_cached_tokens,
          num_model_requests: r.num_model_requests ?? 0,
        });
      }
    }
    return out;
  } catch {
    return null;
  }
}
