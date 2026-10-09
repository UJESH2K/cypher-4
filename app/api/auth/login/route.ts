import { NextResponse } from "next/server";
import { isHttps } from "@/lib/auth/server";
import { SESSION_COOKIE, SESSION_HOURS, signSession } from "@/lib/auth/session";
import { checkPassword } from "@/lib/auth/users";

export const dynamic = "force-dynamic";

// Best-effort brake on password guessing: 8 failures per address per minute.
// It lives in memory, so each server instance keeps its own count.
const WINDOW_MS = 60_000;
const MAX_FAILS = 8;
const fails = new Map<string, { n: number; since: number }>();

function blocked(ip: string, now: number): boolean {
  const f = fails.get(ip);
  if (!f) return false;
  if (now - f.since > WINDOW_MS) {
    fails.delete(ip);
    return false;
  }
  return f.n >= MAX_FAILS;
}

function recordFail(ip: string, now: number) {
  const f = fails.get(ip);
  if (!f || now - f.since > WINDOW_MS) fails.set(ip, { n: 1, since: now });
  else f.n += 1;
  if (fails.size > 5000) fails.clear();
}

export async function POST(req: Request) {
  const now = Date.now();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  if (blocked(ip, now)) return NextResponse.json({ ok: false, error: "rate" }, { status: 429 });

  let body: { id?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id.slice(0, 64) : "";
  const password = typeof body.password === "string" ? body.password.slice(0, 128) : "";
  if (!id || !password) return NextResponse.json({ ok: false, error: "invalid" }, { status: 401 });

  const user = await checkPassword(id, password);
  if (!user) {
    recordFail(ip, now);
    console.info(`[auth] failed sign-in for "${id.replace(/[^\w@.-]/g, "")}"`);
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 401 });
  }

  fails.delete(ip);
  const res = NextResponse.json({ ok: true, user });
  res.cookies.set(SESSION_COOKIE, await signSession(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps(req),
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
  console.info(`[auth] ${user.id} signed in`);
  return res;
}
