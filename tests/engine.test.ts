import assert from "node:assert/strict";
import { test } from "node:test";
import { applyOption } from "../lib/apply";
import { answer } from "../lib/chat";
import { parseCsv, readTable, toCsv } from "../lib/csv";
import { addDays } from "../lib/dates";
import { analyse, pickBest, simulate } from "../lib/engine";
import { buildSample } from "../lib/sample";
import { DEFAULT_SETTINGS, type Dataset, type SaleRow } from "../lib/types";
import { emptyLocation, ordersOverdue, priceHike, rush, setRecentRate } from "../lib/whatif";

const TODAY = "2026-10-09";
const S = DEFAULT_SETTINGS;

function steady(sku: string, location: string, perDay: number, daysBack = 28): SaleRow[] {
  const rows: SaleRow[] = [];
  let carry = 0;
  for (let d = daysBack; d >= 1; d--) {
    carry += perDay;
    const qty = Math.floor(carry + 1e-9);
    carry -= qty;
    if (qty > 0) rows.push({ date: addDays(TODAY, -d), sku, location, qty_sold: qty });
  }
  return rows;
}

// The exact morning described in the challenge brief.
function briefMorning(belgaumStock: number): Dataset {
  return {
    products: [{ sku: "F1", name: "Filter", machine_model: "JCB 3DX", category: "Filters" }],
    inventory: [
      { sku: "F1", location: "Gokak", stock: 8 },
      { sku: "F1", location: "Belgaum", stock: belgaumStock },
    ],
    sales: [...steady("F1", "Gokak", 4), ...steady("F1", "Belgaum", 0.3)],
    suppliers: [
      { supplier: "Usual", sku: "F1", price: 300, lead_time_days: 7, moq: 50 },
      { supplier: "Fast", sku: "F1", price: 360, lead_time_days: 3, moq: 10 },
    ],
    purchase_orders: [],
    transfers: [],
  };
}

test("simulate: 8 units selling 4 a day run dry in 2 days", () => {
  const r = simulate(8, 4, [], 10);
  assert.equal(r.runoutIn, 2);
  assert.equal(r.lostUnits, 32);
  const helped = simulate(8, 4, [{ day: 3, qty: 100 }], 10);
  assert.equal(helped.lostUnits, 4); // day 3 only
});

test("brief example: checks Belgaum first and recommends the transfer", () => {
  const a = analyse(briefMorning(140), S, TODAY);
  const issue = a.issues.find((i) => i.kind === "stockout" && i.location === "Gokak");
  assert.ok(issue, "Gokak stock-out is found");
  assert.equal(issue.facts.cover, 2);
  assert.ok(issue.options.length >= 2, "compares at least two options");
  const rec = issue.options.find((o) => o.id === issue.recommended)!;
  assert.equal(rec.type, "transfer");
  assert.equal(rec.from, "Belgaum");
  assert.equal(rec.stockoutDays, 0);
  const usual = issue.options.find((o) => o.id === "po:Usual")!;
  assert.ok(usual.stockoutDays >= 5, "the usual supplier leaves the shelf empty for days");
  assert.ok(usual.notes.some((n) => n.code === "too_slow"));
});

test("brief example: if a transfer won't work, it buys fast and flags the extra cost", () => {
  const a = analyse(briefMorning(0), S, TODAY);
  const issue = a.issues.find((i) => i.kind === "stockout" && i.location === "Gokak")!;
  const rec = issue.options.find((o) => o.id === issue.recommended)!;
  assert.ok(rec.type === "split_po" || rec.type === "po");
  assert.equal(rec.supplier, "Fast");
  assert.ok(rec.premium > 0, "extra cost is shown, not hidden");
  assert.ok(rec.actions.some((x) => x.type === "po"));
});

test("sample data: finds at least three different kinds of problem, each with numbers and options", () => {
  const a = analyse(buildSample(TODAY), S, TODAY);
  const kinds = new Set(a.issues.map((i) => i.kind));
  for (const k of ["stockout", "overdue_po", "slow_stock", "supplier_fit", "demand_spike", "demand_drop"]) assert.ok(kinds.has(k as never), `finds ${k}`);
  for (const i of a.issues) {
    assert.ok(i.options.length >= 2, `${i.id} compares at least two options`);
    assert.ok(i.recommended, `${i.id} has a recommendation`);
    const best = Math.min(...i.options.map((o) => o.totalImpact));
    assert.equal(i.options.find((o) => o.id === i.recommended)!.totalImpact, best, `${i.id} picks the lowest total cost`);
    for (const o of i.options) {
      assert.ok(Number.isFinite(o.totalImpact) && o.totalImpact >= 0);
      assert.equal(o.totalImpact, o.lostMargin + o.freight + o.premium + o.holdingCost + o.writeOff);
    }
  }
  assert.ok(a.issues.length <= 14, "noise is filtered: the list stays short enough to act on");
});

test("rejecting the pick makes the agent offer the next best option", () => {
  const data = buildSample(TODAY);
  const first = analyse(data, S, TODAY).issues.find((i) => i.id === "stockout|HF-220|Gokak")!;
  const second = analyse(data, S, TODAY, { [first.id]: [first.recommended] }).issues.find((i) => i.id === first.id)!;
  assert.notEqual(second.recommended, first.recommended);
  assert.equal(pickBest(first.options, first.options.map((o) => o.id)), "");
});

test("approving a transfer moves the stock and clears both linked problems", () => {
  const data = buildSample(TODAY);
  const before = analyse(data, S, TODAY);
  const issue = before.issues.find((i) => i.id === "stockout|HF-220|Gokak")!;
  const rec = issue.options.find((o) => o.id === issue.recommended)!;
  const after = applyOption(data, rec);
  const belgaum = (d: Dataset) => d.inventory.find((r) => r.sku === "HF-220" && r.location === "Belgaum")!.stock;
  assert.equal(belgaum(after), belgaum(data) - rec.transferQty);
  assert.equal(belgaum(data), 140, "the original dataset is not mutated");
  const again = analyse(after, S, TODAY);
  assert.ok(!again.issues.some((i) => i.id === issue.id), "Gokak no longer runs out");
  assert.ok(!again.issues.some((i) => i.id === "slow_stock|HF-220|Belgaum"), "Belgaum's pile is gone too");
});

test("approving a purchase order creates an open order that the next run counts", () => {
  const data = buildSample(TODAY);
  const issue = analyse(data, S, TODAY).issues.find((i) => i.id === "stockout|HO-068|Haveri")!;
  const after = applyOption(data, issue.options.find((o) => o.id === issue.recommended)!);
  assert.ok(after.purchase_orders.length > data.purchase_orders.length);
  assert.ok(!analyse(after, S, TODAY).issues.some((i) => i.id === issue.id));
});

test("situations nobody planned for do not break it", () => {
  const empty: Dataset = { products: [], inventory: [], sales: [], suppliers: [], purchase_orders: [], transfers: [] };
  assert.equal(analyse(empty, S, TODAY).issues.length, 0);

  // Stock but no sales history and no suppliers.
  const bare: Dataset = { ...empty, inventory: [{ sku: "X", location: "Somewhere New", stock: 5 }] };
  assert.doesNotThrow(() => analyse(bare, S, TODAY));

  // A part that is selling with no supplier on file, at a place the app has never heard of.
  const noSup: Dataset = { ...empty, inventory: [{ sku: "X", location: "Nippani", stock: 3 }], sales: steady("X", "Nippani", 2) };
  const a = analyse(noSup, S, TODAY);
  assert.equal(a.issues[0].kind, "stockout");
  assert.ok(a.issues[0].options.length >= 1);

  // A purchase order with no location, a bad date and an odd status.
  const odd: Dataset = {
    ...briefMorning(140),
    purchase_orders: [
      { po: "P1", supplier: "Usual", sku: "F1", qty: 50, expected_date: "not a date", status: "OPEN" },
      { po: "P2", supplier: "Nobody", sku: "ZZ", qty: 5, expected_date: addDays(TODAY, -3), status: "open" },
    ],
  };
  assert.doesNotThrow(() => analyse(odd, S, TODAY));

  // Negative and zero values.
  const neg: Dataset = { ...briefMorning(140), inventory: [{ sku: "F1", location: "Gokak", stock: -4 }] };
  assert.doesNotThrow(() => analyse(neg, S, TODAY));
});

test("what-if edits change the answer in the direction a buyer would expect", () => {
  const data = buildSample(TODAY);
  const base = analyse(data, S, TODAY);
  const overdue = (a: typeof base) => a.issues.filter((i) => i.kind === "overdue_po").length;

  assert.ok(overdue(analyse(ordersOverdue(data, TODAY), S, TODAY)) > overdue(base));

  const rushed = analyse(rush(data, TODAY, "Dharwad"), S, TODAY);
  assert.ok(rushed.issues.filter((i) => i.location === "Dharwad").length > base.issues.filter((i) => i.location === "Dharwad").length);

  // With the fast supplier 20% dearer, the urgent Haveri order costs more.
  const cost = (a: typeof base) => {
    const i = a.issues.find((x) => x.id === "stockout|HO-068|Haveri")!;
    return i.options.find((o) => o.id === i.recommended)!.totalImpact;
  };
  assert.ok(cost(analyse(priceHike(data, "Hubli Trade Link"), S, TODAY)) > cost(base));

  // With the warehouse empty, Dharwad's late seal kits can no longer be bridged from it.
  const noWh = analyse(emptyLocation(data, "Hubli Warehouse"), S, TODAY).issues.find((i) => i.id === "overdue_po|PO-2291")!;
  assert.ok(!noWh.options.some((o) => o.from === "Hubli Warehouse"));

  // A store that suddenly sells ten a day of a slow part gets flagged.
  const spiked = analyse(setRecentRate(data, TODAY, "TP-090", "Gadag", 10), S, TODAY);
  assert.ok(spiked.issues.some((i) => i.sku === "TP-090" && i.location === "Gadag"));
});

test("chat answers from the records and admits what it does not know", () => {
  const data = buildSample(TODAY);
  const analysis = analyse(data, S, TODAY);
  const ctx = { data, analysis, settings: S, handled: {} };
  assert.match(answer({ type: "top" }, "en", ctx), /most urgent/);
  assert.match(answer({ type: "late" }, "en", ctx), /PO-2291/);
  assert.match(answer({ type: "free", text: "how much hydraulic hose is at Vijayapura?" }, "en", ctx), /Vijayapura/);
  assert.match(answer({ type: "free", text: "who supplies the air filter" }, "en", ctx), /Coimbatore/);
  assert.match(answer({ type: "free", text: "what is the weather in Delhi" }, "en", ctx), /do not have that/);
  assert.match(answer({ type: "free", text: "गोकाक में क्या चल रहा है" }, "hi", ctx), /गोकाक/);
});

test("csv: reads quoted fields, reports missing columns, round-trips", () => {
  const rows = parseCsv('sku,location,stock\n"HF-220","Gokak, North",8\n');
  assert.deepEqual(rows[0], { sku: "HF-220", location: "Gokak, North", stock: "8" });
  assert.deepEqual(readTable("inventory", "sku,stock\nA,1").missing, ["location"]);
  const typed = readTable("suppliers", "Supplier,SKU,Price,Lead Time Days,MOQ\nAcme,A,\"₹1,200\",5,10");
  assert.equal(typed.rows[0].price, 1200);
  assert.equal(typed.rows[0].lead_time_days, 5);
  assert.equal(parseCsv(toCsv([{ a: 'x "y"', b: "1,2" }], ["a", "b"]))[0].a, 'x "y"');
});
