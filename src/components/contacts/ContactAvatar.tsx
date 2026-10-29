import { avatarColor } from "@/lib/avatar";
import { contactInitials } from "./format";

/**
 * Profile picture when the platform gave us one, initials otherwise.
 *
 * The initials always render underneath the photo: Instagram's CDN links
 * expire, and a broken <img alt=""> paints nothing, so the initials show
 * through without any client-side error handling.
 */
export function ContactAvatar({
  name,
  displayName,
  fallback,
  photoUrl,
  eager = false,
  className = "",
}: {
  /** Real name or username, used for initials. */
  name: string | null;
  /** What the row shows as the name; keys the colour so it matches the inbox. */
  displayName: string;
  /** Used for initials when there is no name (e.g. the platform id). */
  fallback: string;
  photoUrl: string | null;
  eager?: boolean;
  className?: string;
}) {
  const colors = avatarColor(displayName);
  return (
    <span aria-hidden="true" className={`avatar-md relative overflow-hidden ${colors.bg} ${colors.text} ${className}`}>
      {contactInitials(name, fallback)}
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt=""
          width={40}
          height={40}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
    </span>
  );
}
