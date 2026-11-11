import { notFound } from "next/navigation";
import { requireOrgMember } from "@/lib/auth/guards";
import { signState } from "@/lib/auth/oauth-state";
import { buildIgLoginUrl, hasCommentAccess, pickIgAppId } from "@/lib/channels/ig-scopes";
import { getCommentDmOverview } from "@/lib/comment-dm/overview";
import { settingsOrDefaults } from "@/lib/comment-dm/store";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { IconArrowLeft } from "@/components/icons";
import { saveCommentDmSettings, setCommentDmEnabled } from "./actions";
import { TextFields } from "./TextFields";

export const dynamic = "force-dynamic";

export default async function CommentDmPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string; channelId: string }>;
  searchParams: Promise<{ saved?: string; connected?: string; error?: string }>;
}) {
  const { orgId, channelId } = await params;
  const { saved, connected, error } = await searchParams;
  const ctx = await requireOrgMember(orgId);
  const isOwner = ctx.role === "owner";
  const admin = createSupabaseAdminClient();

  const [{ data: channel }, { data: settingsRow }, { data: metaSettings }] = await Promise.all([
    admin
      .from("channels")
      .select("id, platform, display_name, external_id, granted_scopes")
      .eq("id", channelId)
      .eq("org_id", orgId)
      .maybeSingle(),
    admin.from("comment_dm_settings").select("*").eq("channel_id", channelId).eq("org_id", orgId).maybeSingle(),
    admin.from("meta_settings").select("app_id, ig_app_id").eq("org_id", orgId).maybeSingle(),
  ]);
  if (!channel || channel.platform !== "instagram") notFound();

  const settings = settingsOrDefaults(settingsRow, channelId, orgId);
  const overview = await getCommentDmOverview(channelId);
  const commentAccess = hasCommentAccess(channel.granted_scopes as string[] | null);
  const name = (channel.display_name as string | null) ?? (channel.external_id as string);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inboxweave.com";
  const igAppId = pickIgAppId(metaSettings, process.env.META_APP_ID);
  const reconnectUrl =
    isOwner && igAppId
      ? buildIgLoginUrl({
          appId: igAppId,
          appUrl,
          withComments: true,
          state: signState({ orgId, uid: ctx.userId, flow: "ig", withComments: true, returnTo: "comment-dm" }),
        })
      : null;

  const counts = [
    { label: "DMs sent", value: overview.dmsSent },
    { label: "Links sent", value: overview.linksSent },
    { label: "Waiting on a follow", value: overview.awaitingFollow },
    { label: "Failed", value: overview.failed },
    { label: "Warnings", value: overview.warnings },
  ];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <a
        href={`/app/${orgId}/channels`}
        className="mb-3 inline-flex items-center gap-1 text-xs text-slate-400 transition-colors hover:text-slate-600"
      >
        <IconArrowLeft className="h-3 w-3" /> Channels
      </a>
      <div className="page-header">
        <h1>Comment to DM</h1>
        <p>
          When someone comments on any post or reel of <strong>{name}</strong>, reply under the comment and DM them a
          button. Tapping it sends your link (once they follow you, if Require follow is on).
        </p>
      </div>

      {saved && <Banner tone="green">Saved.</Banner>}
      {connected && <Banner tone="green">Comment access allowed. Add your link, then turn Comment to DM on.</Banner>}
      {error && <Banner tone="red">{error}</Banner>}

      {!commentAccess && (
        <section className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <div className="mb-1 font-semibold">This account needs comment access</div>
          <p className="mb-3 text-amber-800">
            It was connected before Comment to DM existed, comment access wasn&apos;t allowed, or signing up for comment
            updates failed. Reconnect it once and allow access to comments.
          </p>
          {reconnectUrl ? (
            <a className="btn btn-sm" href={reconnectUrl}>Reconnect to allow comment access</a>
          ) : (
            <p className="text-xs text-amber-800">
              {isOwner ? "Add your Meta app credentials in Settings → Meta first." : "Ask an owner to reconnect it."}
            </p>
          )}
        </section>
      )}

      <section className="card mb-4 flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Comment to DM</h2>
            <span className={settings.enabled ? "badge-green" : "badge-gray"}>{settings.enabled ? "On" : "Off"}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {settings.enabled
              ? "New comments get a public reply and a DM."
              : "Comments are ignored. Save your link, then turn it on."}
          </p>
        </div>
        {isOwner && (
          <form action={setCommentDmEnabled}>
            <input type="hidden" name="orgId" value={orgId} />
            <input type="hidden" name="channelId" value={channelId} />
            <input type="hidden" name="enabled" value={settings.enabled ? "false" : "true"} />
            <button className={settings.enabled ? "btn-ghost btn-sm" : "btn btn-sm"} type="submit">
              {settings.enabled ? "Turn off" : "Turn on"}
            </button>
          </form>
        )}
      </section>

      <form action={saveCommentDmSettings} className="card mb-4">
        <input type="hidden" name="orgId" value={orgId} />
        <input type="hidden" name="channelId" value={channelId} />
        <fieldset disabled={!isOwner} className="space-y-5">
          <div>
            <label className="label" htmlFor="linkUrl">Your link</label>
            <input
              className="input"
              id="linkUrl"
              name="linkUrl"
              type="url"
              inputMode="url"
              placeholder="https://"
              defaultValue={settings.linkUrl ?? ""}
              maxLength={2000}
              pattern="https://.*"
              title="Must start with https://"
            />
            <p className="mt-1 text-[10px] text-slate-400">
              What people get when they tap the button. Must start with https://
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="defaultLanguage">Default language</label>
              <select className="input" id="defaultLanguage" name="defaultLanguage" defaultValue={settings.defaultLanguage}>
                <option value="en">English</option>
                <option value="ar">العربية (Arabic)</option>
              </select>
              <p className="mt-1 text-[10px] text-slate-400">For comments with no words, like 🔥🔥</p>
            </div>
            <Toggle name="requireFollow" checked={settings.requireFollow} title="Require follow" hint="Only followers get the link" />
            <Toggle
              name="publicReplyEnabled"
              checked={settings.publicReplyEnabled}
              title="Reply under the comment"
              hint="Tells them to check their DMs"
            />
          </div>
          <TextFields saved={settings.texts} />
          {isOwner && <button className="btn" type="submit">Save</button>}
        </fieldset>
      </form>

      <section className="card">
        <h2 className="mb-3 font-semibold">Results</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {counts.map((c) => (
            <div key={c.label} className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-xl font-bold">{c.value}</div>
              <div className="text-[10px] text-slate-500">{c.label}</div>
            </div>
          ))}
        </div>
        {overview.recentProblems.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-xs font-semibold text-slate-500">Latest problems</h3>
            <ul className="space-y-1.5 text-xs">
              {overview.recentProblems.map((f) => (
                <li key={f.id}>
                  <strong>{f.commenterUsername ? `@${f.commenterUsername}` : "Someone"}</strong>
                  <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{f.status}</span>
                  {" — "}
                  <span className="break-words font-mono text-slate-600">{f.error ?? "unknown error"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}

function Banner({ tone, children }: { tone: "green" | "red"; children: React.ReactNode }) {
  const colors =
    tone === "green" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800";
  return <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${colors}`}>{children}</div>;
}

function Toggle({ name, checked, title, hint }: { name: string; checked: boolean; title: string; hint: string }) {
  return (
    <label className="flex items-start gap-2 text-sm sm:pt-6">
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-0.5" />
      <span>
        <span className="font-medium">{title}</span>
        <span className="block text-[10px] text-slate-500">{hint}</span>
      </span>
    </label>
  );
}
