import { NextResponse, type NextRequest } from "next/server";
import { getBetaConfig, isEmailAllowed } from "@/lib/beta/access";
import { REQUEST_ID_HEADER } from "@/lib/request-id";
import { isAdminEmail } from "@/lib/admin-email";
import { hasSessionCookieFromHeader, isAuthDebugEnabled, logAuthDebug } from "@/lib/auth-debug";
import { getCanonicalHost, shouldEnforceCanonicalHost } from "@/lib/canonical-host";
import { auth } from "@/lib/auth";

const PUBLIC_BETA_PATHS = new Set(["/beta", "/login"]);

export async function middleware(req: NextRequest) {
  const requestHeaders = new Headers(req.headers);
  const requestId = requestHeaders.get(REQUEST_ID_HEADER) || crypto.randomUUID();
  const authDebugEnabled = isAuthDebugEnabled();
  const nonce = crypto.randomUUID().replace(/-/g, "");
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  requestHeaders.set("x-nonce", nonce);
  if (authDebugEnabled) {
    requestHeaders.set("x-pathname", req.nextUrl.pathname);
  }

  const pathname = req.nextUrl.pathname;
  const canonicalHost = getCanonicalHost();
  const reqHost = req.nextUrl.host;

  if (
    canonicalHost
    && !pathname.startsWith("/api")
    && shouldEnforceCanonicalHost(reqHost)
    && reqHost !== canonicalHost
  ) {
    const forwardedProto = req.headers.get("x-forwarded-proto");
    const reqProto = req.nextUrl.protocol?.replace(":", "");
    const proto = forwardedProto || reqProto || "https";
    const redirectUrl = new URL(`${req.nextUrl.pathname}${req.nextUrl.search}`, `${proto}://${canonicalHost}`);

    return NextResponse.redirect(redirectUrl, {
      status: 308,
      headers: {
        [REQUEST_ID_HEADER]: requestId,
      },
    });
  }

  const betaConfig = getBetaConfig();

  if (pathname === "/for-you" || pathname.startsWith("/for-you/")) {
    logAuthDebug("middleware.for-you", {
      pathname,
      host: req.nextUrl.host,
      hasCookieHeader: Boolean(req.headers.get("cookie")),
      hasSessionCookieName: hasSessionCookieFromHeader(req.headers.get("cookie")),
      userExists: false,
      redirectTarget: null,
    });
  }


  if (betaConfig.betaMode && !pathname.startsWith("/api") && !PUBLIC_BETA_PATHS.has(pathname)) {
    const session = await auth();
    const email = session?.user?.email ?? null;

    if (!email) {
      const url = new URL("/beta", req.url);
      return NextResponse.redirect(url, {
        headers: {
          [REQUEST_ID_HEADER]: requestId,
        },
      });
    }

    if (!isEmailAllowed(email, betaConfig)) {
      const url = new URL("/beta?reason=not_allowed", req.url);
      return NextResponse.redirect(url, {
        headers: {
          [REQUEST_ID_HEADER]: requestId,
        },
      });
    }
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/api/admin" || pathname.startsWith("/api/admin/")) {
    const session = await auth();
    const email = session?.user?.email ?? null;

    if (!email) {
      if (pathname.startsWith("/api/admin")) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { [REQUEST_ID_HEADER]: requestId } });
      }
      const url = new URL("/login", req.url);
      return NextResponse.redirect(url, {
        headers: {
          [REQUEST_ID_HEADER]: requestId,
        },
      });
    }

    if (!isAdminEmail(email)) {
      if (pathname.startsWith("/api/admin")) {
        return NextResponse.json({ error: "forbidden" }, { status: 403, headers: { [REQUEST_ID_HEADER]: requestId } });
      }
      const url = new URL("/", req.url);
      return NextResponse.redirect(url, {
        headers: {
          [REQUEST_ID_HEADER]: requestId,
        },
      });
    }
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set(REQUEST_ID_HEADER, requestId);
  response.headers.set("x-nonce", nonce);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  response.headers.set(
    "Content-Security-Policy",
    `default-src 'self'; base-uri 'self'; frame-ancestors 'none'; child-src 'self' blob:; img-src 'self' data: blob: https:; font-src 'self' data: https:; worker-src 'self' blob:; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.mapbox.com https://events.mapbox.com https://*.tiles.mapbox.com https:;`,
  );
  return response;
}

export const runtime = "nodejs";

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|api/auth|api/health|api/ops/metrics|api/cron|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
