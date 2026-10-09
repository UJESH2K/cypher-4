import assert from "node:assert/strict";
import { test } from "node:test";
import { DEMO_LOGINS } from "../lib/auth/demo";
import { approvalRight, canEditRecords, type SessionUser, touchesStore } from "../lib/auth/roles";
import { signSession, verifySession } from "../lib/auth/session";
import { checkPassword, findUser } from "../lib/auth/users";
import { analyse } from "../lib/engine";
import { buildSample } from "../lib/sample";
import { DEFAULT_SETTINGS } from "../lib/types";

const SECRET = "a-test-secret-that-is-long-enough";

test("a session token verifies, and any change to it does not", async () => {
  const token = await signSession("ramesh", SECRET);
  const ok = await verifySession(token, SECRET);
  assert.equal(ok?.sub, "ramesh");

  const [body, sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ sub: "auditor", iat: 1, exp: 9999999999 })).toString("base64url");
  assert.equal(await verifySession(`${forged}.${sig}`, SECRET), null, "swapped payload");
  assert.equal(await verifySession(`${body}.${sig.slice(0, -2)}AA`, SECRET), null, "altered signature");
  assert.equal(await verifySession(token, "another-secret-entirely-123"), null, "wrong secret");
  assert.equal(await verifySession("", SECRET), null);
  assert.equal(await verifySession("not-a-token", SECRET), null);
  assert.equal(await verifySession(`${token}.extra`, SECRET), null);
});

test("a session expires after 12 hours", async () => {
  const start = Date.UTC(2026, 9, 9, 8, 0);
  const token = await signSession("ramesh", SECRET, start);
  assert.ok(await verifySession(token, SECRET, start + 11 * 3600 * 1000));
  assert.equal(await verifySession(token, SECRET, start + 12 * 3600 * 1000 + 1000), null);
});

test("every demo login on the sign-in screen matches its stored hash", async () => {
  for (const d of DEMO_LOGINS) {
    const user = await checkPassword(d.id, d.password);
    assert.equal(user?.id, d.id);
    assert.equal(user?.role, d.role);
    assert.equal(user?.store, d.store);
  }
  assert.equal((await checkPassword("RAMESH ", "kaveri@2026"))?.id, "ramesh", "ID is not case sensitive");
  assert.equal(await checkPassword("ramesh", "kaveri@2025"), null, "wrong password");
  assert.equal(await checkPassword("ramesh", ""), null);
  assert.equal(await checkPassword("nobody", "kaveri@2026"), null, "unknown ID");
  assert.equal(findUser("nobody"), null);
});

test("approval rights follow the role: purchasing approves, a store moves its own stock, audit only looks", () => {
  const data = buildSample("2026-10-09");
  const a = analyse(data, DEFAULT_SETTINGS, "2026-10-09");
  const ramesh = findUser("ramesh") as SessionUser;
  const savitha = findUser("savitha") as SessionUser;
  const auditor = findUser("auditor") as SessionUser;

  const gokak = a.issues.find((i) => i.id === "stockout|HF-220|Gokak");
  assert.ok(gokak, "the brief's Gokak filter problem is found");
  const transfer = gokak.options.find((o) => o.actions.length > 0 && o.actions.every((x) => x.type === "transfer"));
  const po = gokak.options.find((o) => o.actions.some((x) => x.type === "po"));
  assert.ok(transfer && po);

  assert.equal(approvalRight(ramesh, gokak, po), "approve");
  assert.equal(approvalRight(savitha, gokak, transfer), "approve", "a transfer into Gokak");
  assert.equal(approvalRight(savitha, gokak, po), "request", "a purchase order commits company cash");
  assert.equal(approvalRight(auditor, gokak, transfer), "none");

  assert.ok(touchesStore(gokak, "Gokak"));
  const haveri = a.issues.find((i) => i.location === "Haveri" && i.kind === "stockout");
  assert.ok(haveri && !touchesStore(haveri, "Gokak"));

  assert.equal(canEditRecords(ramesh), true);
  assert.equal(canEditRecords(auditor), false);
});
