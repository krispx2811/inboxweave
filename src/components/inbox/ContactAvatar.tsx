import { IconInstagram, IconWhatsApp } from "@/components/icons";
import { avatarColor, getInitials } from "@/lib/avatar";
import { IconMessenger } from "./ui";

const CHANNELS: Record<string, { label: string; bg: string; icon?: (p: { className?: string }) => React.ReactNode }> = {
  instagram: { label: "Instagram", bg: "bg-pink-600", icon: IconInstagram },
  whatsapp: { label: "WhatsApp", bg: "bg-green-600", icon: IconWhatsApp },
  messenger: { label: "Messenger", bg: "bg-blue-600", icon: IconMessenger },
};

export function channelLabel(platform: string | null | undefined): string {
  if (!platform) return "Unknown channel";
  return CHANNELS[platform]?.label ?? `${platform.charAt(0).toUpperCase()}${platform.slice(1)}`;
}

/**
 * Profile picture (or initials) with the channel's mark on the corner, so the
 * channel is visible at a glance without a text badge on every row.
 */
export function ContactAvatar({
  name,
  contactName,
  externalId,
  pictureUrl,
  platform,
  size = "md",
}: {
  name: string;
  contactName: string | null;
  externalId: string;
  pictureUrl: string | null;
  platform: string | null | undefined;
  size?: "sm" | "md";
}) {
  const px = size === "sm" ? 32 : 40;
  const colors = avatarColor(name);
  const channel = platform ? CHANNELS[platform] : undefined;
  const Icon = channel?.icon;
  return (
    <span className="relative inline-flex shrink-0">
      {pictureUrl ? (
        // Platform CDN URLs, not worth routing through next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={pictureUrl}
          alt=""
          width={px}
          height={px}
          loading="lazy"
          referrerPolicy="no-referrer"
          className={`${size === "sm" ? "avatar-sm" : "avatar-md"} bg-slate-100 object-cover`}
        />
      ) : (
        <span aria-hidden="true" className={`${size === "sm" ? "avatar-sm" : "avatar-md"} ${colors.bg} ${colors.text}`}>
          {getInitials(contactName, externalId || name)}
        </span>
      )}
      {channel && Icon && (
        <span
          title={channel.label}
          className={`absolute -bottom-0.5 -end-0.5 flex h-4 w-4 items-center justify-center rounded-full text-white ring-2 ring-white ${channel.bg}`}
        >
          <span aria-hidden="true" className="inline-flex">
            <Icon className="h-2.5 w-2.5" />
          </span>
          <span className="sr-only">{channel.label}</span>
        </span>
      )}
    </span>
  );
}
