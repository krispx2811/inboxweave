"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

/**
 * Sidebar link that prefetches on intent (hover, focus, touch) instead of as
 * soon as it's on screen. With eight dashboard tabs always visible, the
 * default prefetched every tab — each a server render with its own database
 * queries — whenever any page loaded.
 */
export function NavLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  const prefetch = () => router.prefetch(href);
  return (
    <Link
      href={href}
      prefetch={false}
      onMouseEnter={prefetch}
      onFocus={prefetch}
      onTouchStart={prefetch}
      aria-current={active ? "page" : undefined}
      className={`${className ?? ""} ${active ? "nav-link-active" : ""}`}
    >
      {children}
    </Link>
  );
}
