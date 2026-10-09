import { cookies } from "next/headers";
import type { SessionUser } from "./roles";
import { SESSION_COOKIE, verifySession } from "./session";
import { findUser } from "./users";

/** The signed-in user for this request, or null. For server components and route handlers. */
export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
  return session ? findUser(session.sub) : null;
}

/** True when the request arrived over HTTPS, directly or through the host's proxy. */
export function isHttps(req: Request): boolean {
  return new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
}
