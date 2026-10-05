import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// /api/kiosk serves the unauthenticated student flow (authorized by session
// id/code in the route itself); /api/cron is authorized by CRON_SECRET.
// Redirecting either to /login breaks them: the kiosk fetch would get the
// login page's HTML instead of JSON.
const PUBLIC_PATHS = ["/login", "/student", "/offline", "/sw.js", "/api/kiosk", "/api/cron"];

/**
 * A `NextResponse.redirect()` is a brand-new response object; it does not
 * inherit whatever `response` picked up from the Supabase client's
 * `setAll` (a just-refreshed session cookie, rotated every time an access
 * token is renewed). Returning the redirect as-is would silently drop
 * that refreshed cookie: the browser keeps presenting its old, now
 * already-rotated refresh token on the next request, which needs
 * refreshing again, which redirects again, which drops the cookie again
 * -- an infinite redirect loop ("Load cannot follow more than 20
 * redirections"). Every redirect below must go through this so a session
 * refresh that happens to land on a request that also redirects still
 * reaches the browser.
 */
function redirectWithRefreshedCookies(url: URL, response: NextResponse) {
  const redirectResponse = NextResponse.redirect(url);
  for (const cookie of response.cookies.getAll()) {
    redirectResponse.cookies.set(cookie);
  }
  return redirectResponse;
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return redirectWithRefreshedCookies(url, response);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return redirectWithRefreshedCookies(url, response);
  }

  if (user && !isPublic) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .single();

    if (profile && !profile.is_active) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("deactivated", "1");
      return redirectWithRefreshedCookies(url, response);
    }

    if (pathname.startsWith("/admin") || pathname.startsWith("/specialist")) {
      const requiredRole = pathname.startsWith("/admin") ? "administrator" : "reading_specialist";
      if (profile?.role !== requiredRole) {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        return redirectWithRefreshedCookies(url, response);
      }
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)"],
};
