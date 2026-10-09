import "server-only";
import { applyOption } from "../apply";
import { approvalRight, canEditRecords, type SessionUser } from "../auth/roles";
import { analyse } from "../engine";
import { LOCATIONS } from "../geo";
import type { Key } from "../i18n";
import { type ApprovalRequest, type Dataset, DEFAULT_SETTINGS, type Handled, type LogEntry, type Settings } from "../types";
import { db } from "./client";

// The server's view of the books. Every read comes from Postgres through one
// function (api_snapshot); every change is written back as a small diff. The
// browser never sends a decision's contents, only which option it chose: the
// server runs the agent itself on the stored data and checks the user's rights
// before anything is written.

export type ServerState = {
  asOf: string;
  data: Dataset;
  settings: Settings;
  handled: Record<string, Handled>;
  rejected: Record<string, string[]>;
  requests: Record<string, ApprovalRequest>;
  log: LogEntry[];
};

export class StoreError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

/** Today's date in India, which is what "this morning" means for Kaveri. */
export function istToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function need() {
  const c = db();
  if (!c) throw new StoreError(503, "no_database");
  return c;
}

type Snapshot = {
  as_of: string | null;
  products: Dataset["products"];
  inventory: Dataset["inventory"];
  suppliers: Dataset["suppliers"];
  purchase_orders: Dataset["purchase_orders"];
  transfers: Dataset["transfers"];
  sales: Dataset["sales"];
  longRates: NonNullable<Dataset["longRates"]>;
  settings: Partial<Settings> | null;
  handled: Record<string, { issue: Handled["issue"]; option: Handled["option"]; at: string; by?: string }>;
  rejected: Record<string, string[]>;
  requests: Record<string, ApprovalRequest>;
  log: (Omit<LogEntry, "decision"> & { decision: LogEntry["decision"] })[];
};

async function snapshot(): Promise<Snapshot> {
  const { data, error } = await need().rpc("api_snapshot", { window_days: 35 });
  if (error) throw new StoreError(500, `snapshot_failed: ${error.message}`);
  return data as Snapshot;
}

export async function loadState(): Promise<ServerState> {
  let s = await snapshot();
  if (!s.as_of) throw new StoreError(503, "not_seeded");
  // A new day starts from the morning's books, the same as the app always has.
  if (s.as_of < istToday()) {
    const { error } = await need().rpc("reset_demo");
    // If the roll fails, keep serving yesterday's books rather than no books at all.
    if (error) console.error(`[db] could not roll the books forward: ${error.message}`);
    else s = await snapshot();
  }
  return {
    asOf: s.as_of as string,
    data: {
      products: s.products,
      inventory: s.inventory,
      suppliers: s.suppliers,
      purchase_orders: s.purchase_orders,
      transfers: s.transfers,
      sales: s.sales,
      longRates: s.longRates,
    },
    settings: { ...DEFAULT_SETTINGS, ...(s.settings ?? {}) },
    handled: s.handled,
    rejected: s.rejected,
    requests: s.requests,
    log: s.log,
  };
}

// ---------- Writing changes back ----------

const CHUNK = 1000;

async function upsert(table: string, rows: object[], onConflict: string) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await need().from(table).upsert(rows.slice(i, i + CHUNK), { onConflict });
    if (error) throw new StoreError(500, `${table}_write_failed: ${error.message}`);
  }
}

async function removeWhere(table: string, match: Record<string, string>) {
  const { error } = await need().from(table).delete().match(match);
  if (error) throw new StoreError(500, `${table}_delete_failed: ${error.message}`);
}

function diffRows<T>(before: T[], after: T[], keyOf: (r: T) => string, same: (a: T, b: T) => boolean) {
  const old = new Map(before.map((r) => [keyOf(r), r]));
  const now = new Map(after.map((r) => [keyOf(r), r]));
  const changed = after.filter((r) => {
    const o = old.get(keyOf(r));
    return !o || !same(o, r);
  });
  const removed = before.filter((r) => !now.has(keyOf(r)));
  return { changed, removed };
}

/** Write the difference between two versions of the books. */
export async function persistDiff(before: Dataset, after: Dataset, by?: string) {
  const c = need();
  const known = new Set(LOCATIONS.map((l) => l.name));

  // New names from an uploaded file must exist before rows can point at them.
  const newPlaces = [...new Set([...after.inventory.map((r) => r.location), ...after.sales.map((r) => r.location)])].filter((n) => !known.has(n));
  if (newPlaces.length) await upsert("locations", newPlaces.map((name) => ({ name, kind: /warehouse|godown/i.test(name) ? "warehouse" : "store", lat: 0, lon: 0, lang: "en" })), "name");
  const products = diffRows(before.products, after.products, (p) => p.sku, (a, b) => a.name === b.name && a.machine_model === b.machine_model && a.category === b.category);
  if (products.changed.length) await upsert("products", products.changed.map(({ sku, name, machine_model, category }) => ({ sku, name, machine_model, category })), "sku");
  const skus = new Set(after.products.map((p) => p.sku));
  const strays = [...new Set([...after.inventory, ...after.suppliers, ...after.sales].map((r) => r.sku))].filter((s) => !skus.has(s));
  if (strays.length) await upsert("products", strays.map((sku) => ({ sku, name: sku, machine_model: "Universal", category: "Other" })), "sku");
  const newSuppliers = [...new Set(after.suppliers.map((s) => s.supplier))];
  if (newSuppliers.length) {
    const { data } = await c.from("suppliers").select("supplier").in("supplier", newSuppliers);
    const have = new Set((data ?? []).map((r: { supplier: string }) => r.supplier));
    const add = newSuppliers.filter((s) => !have.has(s));
    if (add.length) await upsert("suppliers", add.map((supplier) => ({ supplier, city: "Unknown", lang: "en" })), "supplier");
  }

  const inv = diffRows(before.inventory, after.inventory, (r) => `${r.sku}|${r.location}`, (a, b) => a.stock === b.stock);
  if (inv.changed.length) await upsert("inventory", inv.changed.map((r) => ({ sku: r.sku, location: r.location, stock: Math.max(0, Math.round(r.stock)), updated_at: new Date().toISOString() })), "sku,location");
  for (const r of inv.removed) await removeWhere("inventory", { sku: r.sku, location: r.location });

  const offers = diffRows(before.suppliers, after.suppliers, (r) => `${r.supplier}|${r.sku}`, (a, b) => a.price === b.price && a.lead_time_days === b.lead_time_days && a.moq === b.moq);
  if (offers.changed.length)
    await upsert("supplier_offers", offers.changed.map((r) => ({ supplier: r.supplier, sku: r.sku, price: r.price, lead_time_days: Math.round(r.lead_time_days), moq: Math.max(1, Math.round(r.moq)) })), "supplier,sku");
  for (const r of offers.removed) await removeWhere("supplier_offers", { supplier: r.supplier, sku: r.sku });

  const pos = diffRows(before.purchase_orders, after.purchase_orders, (r) => r.po, (a, b) => a.qty === b.qty && a.expected_date === b.expected_date && a.status === b.status && a.supplier === b.supplier && (a.location ?? "") === (b.location ?? ""));
  if (pos.changed.length)
    await upsert(
      "purchase_orders",
      pos.changed.map((r) => ({ po: r.po, supplier: r.supplier, sku: r.sku, qty: Math.round(r.qty), expected_date: r.expected_date, status: String(r.status).toLowerCase(), location: r.location || "Hubli Warehouse", created_by: by ?? null })),
      "po",
    );
  for (const r of pos.removed) await removeWhere("purchase_orders", { po: r.po });

  const sales = diffRows(before.sales, after.sales, (r) => `${r.date}|${r.sku}|${r.location}`, (a, b) => a.qty_sold === b.qty_sold);
  if (sales.changed.length) await upsert("sales", sales.changed.map((r) => ({ date: r.date, sku: r.sku, location: r.location, qty_sold: Math.max(0, Math.round(r.qty_sold)) })), "date,sku,location");
  for (const r of sales.removed) await removeWhere("sales", { date: r.date, sku: r.sku, location: r.location });

  const tr = diffRows(before.transfers, after.transfers, (r) => r.id, () => true);
  if (tr.changed.length) await upsert("transfers", tr.changed.map((t) => ({ id: t.id, sku: t.sku, from_location: t.from, to_location: t.to, qty: t.qty, eta: t.eta, created_by: by ?? null })), "id");
  for (const t of tr.removed) await removeWhere("transfers", { id: t.id });
}

// ---------- Decisions ----------

export type DecideInput = { issueId: string; optionId: string; action: "approve" | "reject" | "request"; reason?: string };

export async function decide(user: SessionUser, input: DecideInput): Promise<ServerState> {
  const st = await loadState();
  const analysis = analyse(st.data, st.settings, st.asOf, st.rejected);
  const issue = analysis.issues.find((i) => i.id === input.issueId);
  if (!issue || st.handled[input.issueId]) throw new StoreError(409, "issue_changed");
  const option = issue.options.find((o) => o.id === input.optionId);
  if (!option || (st.rejected[issue.id] ?? []).includes(option.id)) throw new StoreError(409, "option_changed");

  const right = approvalRight(user, issue, option);
  const allowed = input.action === "request" ? right === "request" : right === "approve";
  if (!allowed) throw new StoreError(403, "not_allowed");

  const c = need();
  const at = new Date().toISOString();
  const decision = input.action === "approve" ? "approved" : input.action === "reject" ? "rejected" : "requested";
  const entry = {
    id: `${at}-${issue.id}-${decision}`,
    at,
    decision,
    issue_id: issue.id,
    kind: issue.kind,
    sku: issue.sku,
    location: issue.location,
    option,
    reason: input.action === "reject" ? String(input.reason ?? "reject.other").slice(0, 40) : null,
    by_user: user.id,
    by_name: user.name,
  };

  if (input.action === "approve") {
    await persistDiff(st.data, applyOption(st.data, option), user.name);
    const { error } = await c.from("handled_issues").upsert({ issue_id: issue.id, issue, option, at, by_name: user.name }, { onConflict: "issue_id" });
    if (error) throw new StoreError(500, `handled_write_failed: ${error.message}`);
    await removeWhere("approval_requests", { issue_id: issue.id });
  } else if (input.action === "reject") {
    const { error } = await c.from("rejections").upsert({ issue_id: issue.id, option_id: option.id, at }, { onConflict: "issue_id,option_id" });
    if (error) throw new StoreError(500, `reject_write_failed: ${error.message}`);
    await removeWhere("approval_requests", { issue_id: issue.id });
  } else {
    const { error } = await c
      .from("approval_requests")
      .upsert({ issue_id: issue.id, option_id: option.id, by_user: user.id, by_name: user.name, at }, { onConflict: "issue_id" });
    if (error) throw new StoreError(500, `request_write_failed: ${error.message}`);
  }
  const { error } = await c.from("decisions").insert(entry);
  if (error) throw new StoreError(500, `decision_write_failed: ${error.message}`);
  return loadState();
}

// ---------- Records ----------

const LIMITS = { products: 20000, inventory: 200000, suppliers: 100000, purchase_orders: 50000, sales: 300000, transfers: 10000 };

function validDataset(d: unknown): d is Dataset {
  if (!d || typeof d !== "object") return false;
  const x = d as Record<string, unknown>;
  return (Object.keys(LIMITS) as (keyof typeof LIMITS)[]).every((k) => Array.isArray(x[k]) && (x[k] as unknown[]).length <= LIMITS[k]);
}

export async function saveRecords(user: SessionUser, next: unknown): Promise<ServerState> {
  if (!canEditRecords(user)) throw new StoreError(403, "not_allowed");
  if (!validDataset(next)) throw new StoreError(400, "bad_dataset");
  const st = await loadState();
  await persistDiff(st.data, { ...next, longRates: st.data.longRates }, user.name);
  return loadState();
}

export async function saveSettings(user: SessionUser, settings: unknown): Promise<ServerState> {
  if (!canEditRecords(user)) throw new StoreError(403, "not_allowed");
  if (!settings || typeof settings !== "object") throw new StoreError(400, "bad_settings");
  const clean: Settings = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const v = Number((settings as Record<string, unknown>)[k]);
    if (Number.isFinite(v) && v >= 0) clean[k] = v;
  }
  const { error } = await need().from("app_settings").upsert({ id: 1, value: clean, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw new StoreError(500, `settings_write_failed: ${error.message}`);
  return loadState();
}

export async function resetBooks(user: SessionUser): Promise<ServerState> {
  if (!canEditRecords(user)) throw new StoreError(403, "not_allowed");
  const { error } = await need().rpc("reset_demo");
  if (error) throw new StoreError(500, `reset_failed: ${error.message}`);
  return loadState();
}

// ---------- The agent, run on the server ----------

export type AgentRun = { at: string; ms: number; asOf: string; recordsRead: number; problems: number; optionsCompared: number; drafts: number; top: string[] };

export async function runAgent(user: SessionUser): Promise<AgentRun> {
  const st = await loadState();
  const t0 = performance.now();
  const a = analyse(st.data, st.settings, st.asOf, st.rejected);
  const ms = Math.max(1, Math.round(performance.now() - t0));
  const s = a.stats;
  const run: AgentRun = {
    at: new Date().toISOString(),
    ms,
    asOf: a.asOf,
    recordsRead: s.salesRows + s.stockLines + s.supplierLines + st.data.purchase_orders.length + st.data.products.length + (st.data.longRates?.length ?? 0),
    problems: a.issues.length,
    optionsCompared: s.optionsCompared,
    drafts: s.drafts,
    top: a.issues.slice(0, 3).map((i) => i.id),
  };
  const { error } = await need().from("agent_runs").insert({
    as_of: run.asOf,
    triggered_by: user.name,
    duration_ms: run.ms,
    records_read: run.recordsRead,
    problems: run.problems,
    options_compared: run.optionsCompared,
    drafts: run.drafts,
    top: run.top,
  });
  if (error) console.error("[agent] could not log run:", error.message);
  return run;
}

export async function stats(): Promise<Record<string, unknown>> {
  const { data, error } = await need().rpc("db_stats");
  if (error) throw new StoreError(500, `stats_failed: ${error.message}`);
  return data as Record<string, unknown>;
}

export async function ping(): Promise<"ok" | "not_seeded" | "error" | "off"> {
  const c = db();
  if (!c) return "off";
  const { data, error } = await c.from("dataset_meta").select("key").eq("key", "dataset").maybeSingle();
  if (error) return "error";
  return data ? "ok" : "not_seeded";
}

/** Rejection reasons the UI offers; anything else is stored as "another reason". */
export function cleanReason(r: unknown): Key {
  const ok = ["reject.cost", "reject.supplier", "reject.stock", "reject.other"];
  return (ok.includes(String(r)) ? r : "reject.other") as Key;
}
