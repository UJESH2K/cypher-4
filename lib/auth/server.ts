import { cookies } from "next/headers";
import { db } from "../db/client";
import type { Role, SessionUser } from "./roles";
import { SESSION_COOKIE, verifySession } from "./session";
import { checkPassword, derive, DUMMY, findUser, sameHex } from "./users";

// Accounts live in the app_users table. If the database is not configured or
// cannot be reached, the built-in accounts in users.ts still let people in.

type Row = { id: string; name: string; role: Role; store: string | null; initials: string; salt: string; hash: string };

const toUser = (r: Row): SessionUser => ({ id: r.id, name: r.name, role: r.role, store: r.store ?? undefined, initials: r.initials });

// Session checks happen on every request, so remember accounts for a minute.
const cache = new Map<string, { user: SessionUser | null; until: number }>();

async function fetchRow(id: string): Promise<Row | null | undefined> {
  const c = db();
  if (!c) return undefined;
  const { data, error } = await c.from("app_users").select("id,name,role,store,initials,salt,hash").eq("id", id).maybeSingle();
  if (error) {
    console.error("[auth] user lookup failed, using built-in accounts:", error.message);
    return undefined;
  }
  return (data as Row | null) ?? null;
}

export async function lookupUser(id: string): Promise<SessionUser | null> {
  const hit = cache.get(id);
  if (hit && hit.until > Date.now()) return hit.user;
  const row = await fetchRow(id);
  const user = row === undefined ? findUser(id) : row ? toUser(row) : null;
  cache.set(id, { user, until: Date.now() + 60_000 });
  return user;
}

/** Checks an ID and password against the database, or the built-in accounts when there is none. */
export async function authenticate(id: string, password: string): Promise<SessionUser | null> {
  const clean = id.trim().toLowerCase();
  const row = await fetchRow(clean);
  if (row === undefined) return checkPassword(clean, password);
  const ok = sameHex(await derive(password, row?.salt ?? DUMMY.salt), row?.hash ?? DUMMY.hash);
  return ok && row ? toUser(row) : null;
}

/** The signed-in user for this request, or null. For server components and route handlers. */
export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
  return session ? lookupUser(session.sub) : null;
}

/** True when the request arrived over HTTPS, directly or through the host's proxy. */
export function isHttps(req: Request): boolean {
  return new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
}
