// src/proxy.js
import { NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Quick check only: no session cookie → login page. The real check (is the session valid,
 * is the person still active) happens in requireUser() and in every Server Action.
 */
export function proxy(request) {
  if (getSessionCookie(request)) return NextResponse.next();
  const url = new URL("/login", request.url);
  const path = request.nextUrl.pathname + request.nextUrl.search;
  if (path !== "/") url.searchParams.set("next", path);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except login, auth API, health check, Next internals and files with an extension.
  matcher: ["/((?!login|api/auth|api/health|_next|.*\\..*).*)"],
};
