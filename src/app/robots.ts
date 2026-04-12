import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://inboxweave.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/signup", "/terms", "/privacy", "/dpa", "/guides"],
        disallow: ["/app/", "/admin/", "/home", "/onboarding", "/api/"],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
