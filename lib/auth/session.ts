// Signed session tokens. Only Web Crypto is used, so the same code runs in the
// proxy, in route handlers and in the tests.
//
// A token is `<payload>.<signature>`, both base64url. The payload holds the
// user id and an expiry; the signature is HMAC-SHA256 over the payload with
// AUTH_SECRET. The cookie that carries it is HttpOnly, so page scripts never
// see it.

export const SESSION_COOKIE = "kd_session";
export const SESSION_HOURS = 12;

const enc = new TextEncoder();
const dec = new TextDecoder();

export type SessionPayload = { sub: string; iat: number; exp: number };

function toB64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let warned = false;

/** The signing secret. Set AUTH_SECRET in the host's environment; the fallback exists so a fresh clone runs. */
export function authSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 16) return s;
  if (!warned && process.env.NODE_ENV === "production") {
    console.warn("[auth] AUTH_SECRET is not set (or shorter than 16 characters); using the built-in demo secret.");
    warned = true;
  }
  return "kaveri-desk-demo-secret-set-AUTH_SECRET-in-production";
}

export function usingDemoSecret(): boolean {
  const s = process.env.AUTH_SECRET;
  return !s || s.length < 16;
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signSession(sub: string, secret = authSecret(), now = Date.now()): Promise<string> {
  const iat = Math.floor(now / 1000);
  const payload: SessionPayload = { sub, iat, exp: iat + SESSION_HOURS * 3600 };
  const body = toB64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body)));
  return `${body}.${toB64url(sig)}`;
}

/** The payload when the token is genuine and unexpired, otherwise null. Never throws. */
export async function verifySession(token: string | undefined | null, secret = authSecret(), now = Date.now()): Promise<SessionPayload | null> {
  if (!token || token.length > 2048) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [body, sig] = parts;
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(dec.decode(fromB64url(body))) as Partial<SessionPayload>;
    if (typeof p.sub !== "string" || typeof p.exp !== "number" || typeof p.iat !== "number") return null;
    if (p.exp * 1000 <= now) return null;
    return { sub: p.sub, iat: p.iat, exp: p.exp };
  } catch {
    return null;
  }
}
