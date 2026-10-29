import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Allow the app to boot with no env vars (dev preview / UI walkthrough).
  // Auth-gated pages will still redirect to /login when hit; the public
  // landing page and /login will render fine.
  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options as never);
          }
        },
      },
    },
  );

  // Refresh auth cookies so Server Components can read a fresh session.
  // Logged-out visitors have nothing to refresh, so skip the Auth round trip.
  const hasSession = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  if (hasSession) await supabase.auth.getUser();

  return response;
}

export const config = {
  // Skip static assets, public files and webhook routes (webhooks have their own auth).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.svg|manifest.json|sw.js|robots.txt|sitemap.xml|api/webhooks).*)",
  ],
};
