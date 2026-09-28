import { NextResponse } from "next/server";
import { isValidSessionCookie, SESSION_COOKIE_NAME } from "./lib/session";

// Protect everything except the login page/API and Next.js internals.
export async function middleware(request) {
  const { pathname } = request.nextUrl;

  const isPublic =
    pathname === "/login" ||
    pathname === "/privacy" ||
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/auth/register") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon");

  if (isPublic) return NextResponse.next();

  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!(await isValidSessionCookie(cookie))) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
