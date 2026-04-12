/**
 * InboxWeave brand logo — an envelope with woven threads.
 * Available in two variants: icon-only and full (icon + wordmark).
 */

export function LogoIcon({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Background */}
      <rect width="40" height="40" rx="10" fill="#4F46E5" />
      {/* Envelope body */}
      <rect x="8" y="13" width="24" height="16" rx="2" fill="white" fillOpacity="0.2" />
      {/* Envelope flap / weave pattern */}
      <path
        d="M8 15l12 8 12-8"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Weave threads */}
      <path
        d="M12 19l4 3-4 3"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.7"
      />
      <path
        d="M28 19l-4 3 4 3"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.7"
      />
      {/* Center dot */}
      <circle cx="20" cy="22" r="1.5" fill="white" opacity="0.9" />
    </svg>
  );
}

export function LogoFull({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <LogoIcon size={32} />
      <span className="text-lg font-bold tracking-tight">
        Inbox<span className="text-indigo-600">Weave</span>
      </span>
    </div>
  );
}

export function LogoIconSmall({ className }: { className?: string }) {
  return <LogoIcon size={24} className={className} />;
}
