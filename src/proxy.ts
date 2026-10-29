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
  // getClaims() refreshes an expired token and otherwise verifies it locally
  // (asymmetric signing keys), so most requests make no Auth round trip.
  if (hasSession) await supabase.auth.getClaims();

  return response;
}

export const config = {
  // Only routes that read the session need their cookies refreshed. Running
  // the proxy elsewhere cost ~0.5s per request (with cold-start spikes) on
  // public pages that have no session. Webhooks, cron and health have their
  // own auth or none; login/signup set cookies in the browser.
  matcher: [
    "/app/:path*",
    "/home",
    "/onboarding",
    "/admin/:path*",
    "/api/((?!webhooks|cron|health).*)",
  ],
};
