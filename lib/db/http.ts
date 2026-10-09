import "server-only";
import { NextResponse } from "next/server";
import type { SessionUser } from "../auth/roles";
import { currentUser } from "../auth/server";
import { StoreError } from "./store";

/** Runs a handler for a signed-in user and turns failures into clean JSON errors. */
export async function withUser(handler: (user: SessionUser) => Promise<unknown>) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  try {
    const t0 = performance.now();
    const body = await handler(user);
    const res = NextResponse.json(body);
    res.headers.set("Server-Timing", `app;dur=${Math.round(performance.now() - t0)}`);
    return res;
  } catch (err) {
    if (err instanceof StoreError) {
      if (err.status >= 500) console.error(`[db] ${err.code}`);
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    console.error("[api] unexpected:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function readJson(req: Request, maxBytes = 8_000_000): Promise<Record<string, unknown>> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new StoreError(413, "too_large");
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    throw new StoreError(400, "bad_json");
  }
}
