import type { Role, SessionUser } from "./roles";

// The demo accounts. Passwords are stored only as PBKDF2-SHA256 hashes
// (120,000 rounds, a random salt per user). The plain demo passwords are
// published on the sign-in screen on purpose, from lib/auth/demo.ts.

type Account = SessionUser & { salt: string; hash: string };

const ITERATIONS = 120_000;

const ACCOUNTS: Account[] = [
  {
    id: "ramesh",
    name: "Ramesh Kulkarni",
    role: "purchasing",
    initials: "RK",
    salt: "517016644a84ee13d0ad2439ccf96f21",
    hash: "eb905f486d782c7df1a523ce1b19121684fbf63f29bf4c53432491d093730d0d",
  },
  {
    id: "savitha",
    name: "Savitha Hiremath",
    role: "store",
    store: "Gokak",
    initials: "SH",
    salt: "ccf40f8798a72a79906a34fdc93e7d58",
    hash: "2391ac867f08cb283104b6b55667225615fb59c2260339aef0c8be08db642672",
  },
  {
    id: "auditor",
    name: "Neha Desai",
    role: "viewer",
    initials: "ND",
    salt: "944dde98d6b3ed6ffcda29c29321c926",
    hash: "3e45edfd2a31641c77ad23aace38d95296581c91896380917b916d4b6e6a828b",
  },
];

// Used for unknown IDs, so a wrong ID takes as long to reject as a wrong password.
const DUMMY = { salt: "7acc954561c60ed6185135e6326f29df", hash: "d574d1c1b07a22cfcdfa5ac907bcb52466a14865f2255b83e642fd948186732d" };

const enc = new TextEncoder();

async function derive(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: ITERATIONS }, key, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compares two equal-length hex strings without stopping at the first difference. */
function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function publicUser(a: Account): SessionUser {
  return { id: a.id, name: a.name, role: a.role, store: a.store, initials: a.initials };
}

export function findUser(id: string): SessionUser | null {
  const a = ACCOUNTS.find((x) => x.id === id);
  return a ? publicUser(a) : null;
}

export async function checkPassword(id: string, password: string): Promise<SessionUser | null> {
  const account = ACCOUNTS.find((x) => x.id === id.trim().toLowerCase());
  const { salt, hash } = account ?? DUMMY;
  const ok = sameHex(await derive(password, salt), hash);
  return ok && account ? publicUser(account) : null;
}

export const ROLES: Role[] = ["purchasing", "store", "viewer"];
