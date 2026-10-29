import Link from "next/link";
import { IconFacebook, IconInstagram, IconUser, IconWhatsApp } from "@/components/icons";
import { contactDisplayName, contactHandle, previewPrefix } from "@/lib/inbox/display";
import type { LatestMessage } from "@/lib/inbox/latest-messages";
import { ContactAvatar } from "./ContactAvatar";
import { RelativeTime } from "./RelativeTime";
import { languageName, platformLabel } from "./format";

export interface ContactConversation {
  id: string;
  contact_name: string | null;
  contact_username: string | null;
  contact_profile_url: string | null;
  contact_external_id: string | null;
  ai_enabled: boolean | null;
  last_message_at: string | null;
  tags: string[] | null;
  status: string | null;
  language: string | null;
  platform: string | null;
  channelName: string | null;
}

/*
 * One DOM for both layouts. Below lg it is a card (avatar on the left; name
 * and time, then the preview, then the chips stacked beside it); from lg up
 * the same cells line up as table columns. Header and rows share CONTACT_GRID.
 */
export const CONTACT_GRID =
  "grid grid-cols-[2.5rem_minmax(0,1fr)_auto] gap-x-3 gap-y-1 " +
  "[grid-template-areas:'avatar_name_time'_'avatar_preview_preview'_'avatar_meta_meta'] " +
  "lg:items-center lg:gap-x-4 lg:gap-y-0 " +
  "lg:grid-cols-[2.5rem_minmax(0,12rem)_minmax(0,1fr)_minmax(0,11rem)_5.5rem] " +
  "lg:[grid-template-areas:'avatar_name_preview_meta_time'] " +
  "xl:grid-cols-[2.5rem_minmax(0,15rem)_minmax(0,1fr)_minmax(0,15rem)_6rem]";

function ChannelIcon({ platform }: { platform: string | null }) {
  const cls = "h-3.5 w-3.5 shrink-0";
  switch (platform) {
    case "instagram": return <IconInstagram className={cls} />;
    case "whatsapp": return <IconWhatsApp className={cls} />;
    case "messenger": return <IconFacebook className={cls} />;
    default: return <IconUser className={cls} />;
  }
}

const STATUS: Record<string, { label: string; dot: string; text: string }> = {
  open: { label: "Open", dot: "bg-slate-400", text: "text-slate-600" },
  resolved: { label: "Resolved", dot: "bg-emerald-500", text: "text-emerald-700" },
  archived: { label: "Archived", dot: "bg-slate-300", text: "text-slate-500" },
};

export function ContactRow({
  orgId,
  contact: c,
  latest,
  eager,
}: {
  orgId: string;
  contact: ContactConversation;
  latest: LatestMessage | undefined;
  eager: boolean;
}) {
  const name = contactDisplayName({ ...c, platform: c.platform });
  const handle = contactHandle(c);
  const channel = platformLabel(c.platform);
  const status = STATUS[c.status ?? "open"] ?? STATUS.open!;
  const language = languageName(c.language);
  const tags = (c.tags ?? []).filter(Boolean);
  const prefix = previewPrefix(latest);

  return (
    // Up to 500 rows: let the browser skip layout/paint for off-screen ones.
    <li className="[contain-intrinsic-size:auto_6.5rem] [content-visibility:auto] lg:[contain-intrinsic-size:auto_4rem]">
      <Link
        href={`/app/${orgId}/inbox?c=${c.id}`}
        prefetch={false}
        className={`${CONTACT_GRID} touch-manipulation rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-indigo-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 lg:rounded-none lg:border-0 lg:px-4 lg:py-3 lg:shadow-none`}
      >
        <ContactAvatar
          name={c.contact_name?.trim() || c.contact_username?.trim() || null}
          displayName={name}
          fallback={c.contact_external_id ?? c.id}
          photoUrl={c.contact_profile_url}
          eager={eager}
          className="self-start [grid-area:avatar] lg:self-center"
        />

        {/* Name, then channel + handle */}
        <span className="min-w-0 [grid-area:name]">
          <span className="flex min-w-0">
            <span dir="auto" className="min-w-0 truncate text-sm font-semibold text-slate-900">
              {name}
            </span>
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-slate-500" title={c.channelName ? `${channel} · ${c.channelName}` : channel}>
            <span aria-hidden="true" className="text-slate-400"><ChannelIcon platform={c.platform} /></span>
            {handle ? (
              <>
                <span className="sr-only">{channel}, </span>
                <span dir="auto" translate="no" className="min-w-0 truncate">{handle}</span>
              </>
            ) : (
              <span className="truncate">{channel}</span>
            )}
          </span>
        </span>

        {/* Last message; the prefix says who sent it (AI or staff). */}
        <span className="flex min-w-0 items-baseline text-sm [grid-area:preview]">
          {latest ? (
            <>
              {prefix ? (
                <span className={`shrink-0 font-medium ${latest.sender === "ai" ? "text-indigo-600" : "text-slate-700"}`}>
                  {prefix.trim()}&nbsp;
                </span>
              ) : null}
              <span dir="auto" className="min-w-0 truncate text-slate-500">
                {latest.preview || "Attachment"}
              </span>
            </>
          ) : (
            <span className="text-slate-400">No messages yet</span>
          )}
        </span>

        {/* Status and details */}
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pt-1 [grid-area:meta] lg:pt-0">
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${status.text}`}>
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
          {c.ai_enabled === false ? <span className="badge-amber">AI off</span> : null}
          {language ? <span className="text-xs text-slate-500">{language}</span> : null}
          {tags.slice(0, 2).map((t) => (
            <span key={t} className="badge-blue min-w-0 max-w-[9rem]">
              <span dir="auto" className="min-w-0 truncate">{t}</span>
            </span>
          ))}
          {tags.length > 2 ? (
            <span className="text-xs text-slate-500" title={tags.slice(2).join(", ")}>+{tags.length - 2}</span>
          ) : null}
        </span>

        <RelativeTime
          iso={c.last_message_at ?? latest?.createdAt ?? null}
          className="whitespace-nowrap text-right text-xs tabular-nums text-slate-500 [grid-area:time]"
        />
      </Link>
    </li>
  );
}
