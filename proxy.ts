import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

// First line of defence: no valid session, no app. Pages redirect to the
// sign-in screen and API calls get a 401. The page and each API route check
// the session again on their own, so this is never the only gate.

const PUBLIC_API = new Set(["/api/health", "/api/auth/login", "/api/auth/logout"]);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith("/api/")) {
    if (session || PUBLIC_API.has(pathname)) return NextResponse.next();
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (pathname === "/login") return session ? NextResponse.redirect(new URL("/", req.url)) : NextResponse.next();
  if (!session) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|woff2?)$).*)"],
};
