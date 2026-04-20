import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { updateAiSettings, updateOpenAIKey } from "./actions";
import Link from "next/link";
import { IconSparkle, IconShield, IconFacebook, IconGlobe, IconBolt } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const admin = createSupabaseAdminClient();
  const [{ data: settings }, { data: secrets }] = await Promise.all([
    admin
      .from("ai_settings")
      .select("system_prompt, temperature, model")
      .eq("org_id", orgId)
      .maybeSingle(),
    admin
      .from("org_secrets")
      .select("openai_api_key_ciphertext, updated_at")
      .eq("org_id", orgId)
      .maybeSingle(),
  ]);

  const hasKey = Boolean(secrets?.openai_api_key_ciphertext);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="page-header">
        <h1>Settings</h1>
        <p>Configure AI behavior and API credentials</p>
      </div>

      <section className="card mb-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <IconSparkle className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold">AI persona</h2>
            <p className="text-xs text-slate-500">Model: {settings?.model ?? "gpt-4o-mini"}</p>
          </div>
        </div>
        <form action={updateAiSettings} className="space-y-4">
          <input type="hidden" name="orgId" value={orgId} />
          <div>
            <label className="label" htmlFor="system_prompt">System prompt</label>
            <textarea
              id="system_prompt"
              name="system_prompt"
              className="input min-h-[180px]"
              defaultValue={settings?.system_prompt ?? ""}
              placeholder="Tell the AI how to behave, what tone to use, and what it should know about your business..."
              required
            />
          </div>
          <div className="max-w-[300px]">
            <label className="label" htmlFor="model">Model</label>
            <select id="model" name="model" className="input" defaultValue={settings?.model ?? "gpt-4o-mini"}>
              <option value="gpt-4o-mini">GPT-4o Mini (fastest, cheapest)</option>
              <option value="gpt-4o">GPT-4o (balanced)</option>
              <option value="gpt-4.1-mini">GPT-4.1 Mini (newest, fast)</option>
              <option value="gpt-4.1">GPT-4.1 (newest, most capable)</option>
              <option value="gpt-4.1-nano">GPT-4.1 Nano (ultra-cheap)</option>
            </select>
          </div>
          <div className="max-w-[200px]">
            <label className="label" htmlFor="temperature">
              Temperature
            </label>
            <input
              id="temperature"
              name="temperature"
              type="number"
              min={0}
              max={2}
              step={0.1}
              className="input"
              defaultValue={settings?.temperature ?? 0.3}
            />
            <p className="mt-1 text-[10px] text-slate-400">Lower = more focused, higher = more creative</p>
          </div>
          <button className="btn" type="submit">Save persona</button>
        </form>
      </section>

      <section className="card">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
            <IconShield className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold">OpenAI API key</h2>
            <p className="text-xs text-slate-500">
              {hasKey ? (
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                  Key configured &middot; updated {new Date(secrets!.updated_at as string).toLocaleDateString()}
                </span>
              ) : (
                "No key configured yet"
              )}
            </p>
          </div>
        </div>
        <form action={updateOpenAIKey} className="space-y-4">
          <input type="hidden" name="orgId" value={orgId} />
          <div>
            <label className="label" htmlFor="apiKey">
              {hasKey ? "Replace key" : "API key"}
            </label>
            <input
              id="apiKey"
              name="apiKey"
              type="password"
              className="input"
              placeholder="sk-..."
              required
              autoComplete="off"
            />
            <p className="mt-1.5 text-[10px] text-slate-400">Encrypted at rest. Never shown again after saving.</p>
          </div>
          <button className="btn" type="submit">Save key</button>
        </form>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link href={`/app/${orgId}/settings/meta`} className="card-hover flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
            <IconFacebook className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold">Meta App</div>
            <div className="text-xs text-slate-500">WhatsApp, Instagram, Messenger credentials</div>
          </div>
        </Link>
        <Link href={`/app/${orgId}/settings/webhooks`} className="card-hover flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-600">
            <IconGlobe className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold">Webhook Events</div>
            <div className="text-xs text-slate-500">Push events to external systems</div>
          </div>
        </Link>
        <Link href={`/app/${orgId}/settings/debug`} className="card-hover flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
            <IconBolt className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold">Webhook Debug Log</div>
            <div className="text-xs text-slate-500">Last 50 incoming webhook requests</div>
          </div>
        </Link>
        <Link href={`/app/${orgId}/settings/gdpr`} className="card-hover flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-600">
            <IconShield className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold">GDPR & Privacy</div>
            <div className="text-xs text-slate-500">Data export and right-to-delete</div>
          </div>
        </Link>
      </div>
    </main>
  );
}
