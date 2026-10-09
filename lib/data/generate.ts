// Builds Kaveri's full dataset for the database.
//
// What is real and what is generated, stated plainly:
// - REAL: the demand pattern of every long-tail part. Each one is driven by a
//   real monthly series from the car-parts dataset (data/carparts): which
//   months had sales, which had none, and how big the bursts were. Only the
//   overall volume is rescaled to Kaveri's size.
// - GENERATED: everything a distributor keeps private and nobody publishes:
//   which store sold on which day (split from the real monthly totals),
//   stock levels, supplier prices, lead times, minimum orders and purchase
//   orders. These follow simple, documented rules.
// - HAND-BUILT: the 14 "headline" parts from lib/sample.ts keep their exact
//   last five weeks, so the morning the challenge describes (Gokak's filter)
//   is still there inside a much larger business.
//
// The output is deterministic: the same seed and date give the same data.

import { addDays, diffDays } from "../dates";
import { buildSample, HISTORY_DAYS } from "../sample";
import type { Dataset, InventoryRow, LongRate, Product, PurchaseOrder, SaleRow, SupplierRow } from "../types";
import { type DemandClass, demandProfile, parseTsf, type Series } from "./carparts";

export type ProductMeta = Product & {
  demand_class: DemandClass;
  adi: number;
  cv2: number;
  abc: "A" | "B" | "C";
  source: string; // "carparts:T123" for real-demand parts, "scenario" for the hand-built ones
  unit_price: number;
};

export type SupplierInfo = { supplier: string; city: string; lang: string; on_time_target: number };

export type PoHistoryRow = {
  po: string;
  supplier: string;
  sku: string;
  qty: number;
  location: string;
  ordered_date: string;
  promised_date: string;
  received_date: string;
};

export type BuiltData = {
  asOf: string;
  dataset: Dataset; // sales holds the full history
  products: ProductMeta[];
  suppliers: SupplierInfo[];
  poHistory: PoHistoryRow[];
  seriesUsed: number;
  seriesAvailable: number;
};

export type BuildOptions = { longTail: number; months: number; seed: number };
export const DEFAULT_BUILD: BuildOptions = { longTail: 320, months: 24, seed: 2026 };

const STORES: [string, number][] = [
  ["Gokak", 1.0],
  ["Belgaum", 1.3],
  ["Dharwad", 1.1],
  ["Gadag", 0.8],
  ["Vijayapura", 1.0],
  ["Haveri", 0.7],
];

const CSF = "Coimbatore Seals & Filters";
const SHR = "Shree Hydraulics";
const DAP = "Deccan Auto Parts";
const PIS = "Peenya Industrial Supplies";
const HTL = "Hubli Trade Link";

// How each supplier behaves. Lead times and premiums match the hand-built offers in lib/sample.ts.
const PROFILE: Record<string, { lead: [number, number]; premium: number; moqMult: number; onTime: number; delay: number; city: string; lang: string }> = {
  [CSF]: { lead: [6, 8], premium: 1.0, moqMult: 1.2, onTime: 0.82, delay: 3, city: "Coimbatore", lang: "ta" },
  [SHR]: { lead: [6, 9], premium: 1.0, moqMult: 1.0, onTime: 0.74, delay: 4, city: "Pune", lang: "hi" },
  [DAP]: { lead: [8, 9], premium: 0.97, moqMult: 2.0, onTime: 0.68, delay: 5, city: "Hyderabad", lang: "te" },
  [PIS]: { lead: [4, 5], premium: 1.07, moqMult: 0.5, onTime: 0.9, delay: 2, city: "Bengaluru", lang: "kn" },
  [HTL]: { lead: [2, 3], premium: 1.18, moqMult: 0.2, onTime: 0.95, delay: 1, city: "Hubballi", lang: "kn" },
};

type Family = { category: string; prefix: string; specialist: string; price: [number, number]; names: string[]; universal: number };
const FAMILIES: Family[] = [
  { category: "Filters", prefix: "FL", specialist: CSF, price: [180, 900], universal: 0, names: ["Fuel filter", "Transmission oil filter", "Hydraulic return filter", "Cabin air filter", "Water separator filter", "Suction strainer"] },
  { category: "Hoses", prefix: "HZ", specialist: DAP, price: [150, 900], universal: 0.3, names: ["Hydraulic hose 3/8 inch", "Hydraulic hose 3/4 inch", "Radiator hose", "Fuel return hose", "High-pressure hose assembly"] },
  { category: "Seals", prefix: "SL", specialist: CSF, price: [120, 1800], universal: 0.2, names: ["Lift cylinder seal kit", "Bucket cylinder seal kit", "Oil seal 45x62", "Head gasket kit", "O-ring assortment"] },
  { category: "Bearings", prefix: "BG", specialist: DAP, price: [150, 1400], universal: 0.5, names: ["Ball bearing 6205", "Ball bearing 6306", "Taper roller bearing 32210", "Needle roller bearing", "Pilot bearing"] },
  { category: "Belts", prefix: "BT", specialist: DAP, price: [180, 900], universal: 0.2, names: ["Alternator belt", "Fan belt B-48", "Timing belt", "Poly-V belt"] },
  { category: "Pumps", prefix: "PM", specialist: SHR, price: [2200, 12000], universal: 0, names: ["Water pump", "Fuel feed pump", "Power steering pump", "Hydraulic gear pump 12 cc"] },
  { category: "Valves", prefix: "VL", specialist: SHR, price: [900, 8000], universal: 0, names: ["Relief valve", "Solenoid valve", "Spool valve", "Check valve"] },
  { category: "Fittings", prefix: "FT", specialist: DAP, price: [25, 450], universal: 0.8, names: ["Hydraulic adaptor 1/2 inch", "Banjo bolt", "Hose clamp set", "Grease nipple set", "Quick coupler 3/8 inch"] },
  { category: "Drivetrain", prefix: "DT", specialist: SHR, price: [700, 7000], universal: 0, names: ["Clutch plate", "Pressure plate", "Universal cross joint", "Pinion gear", "Release bearing"] },
  { category: "Steering", prefix: "ST", specialist: DAP, price: [300, 3000], universal: 0, names: ["Ball joint", "Drag link end", "Steering cylinder kit", "King pin kit"] },
  { category: "Electrical", prefix: "EL", specialist: DAP, price: [150, 7500], universal: 0.1, names: ["Starter solenoid", "Alternator", "Glow plug", "Head lamp assembly", "Starter motor"] },
  { category: "Brakes", prefix: "BK", specialist: DAP, price: [250, 3200], universal: 0, names: ["Brake shoe set", "Brake master cylinder", "Brake lining kit", "Brake disc"] },
  { category: "Engine", prefix: "EN", specialist: SHR, price: [300, 9500], universal: 0, names: ["Piston ring set", "Fuel injector nozzle", "Thermostat", "Cylinder liner kit", "Connecting rod bearing"] },
  { category: "Oils", prefix: "OL", specialist: DAP, price: [350, 2600], universal: 0.9, names: ["Engine oil 15W-40 (5 L)", "Transmission oil (10 L)", "Grease (1 kg)", "Coolant (5 L)"] },
];
const MACHINES = ["JCB 3DX", "JCB 4DX", "Mahindra 575 DI", "Mahindra Arjun 605", "Swaraj 744 FE", "John Deere 5310", "Sonalika DI 750", "Tata Hitachi EX200", "Escorts Farmtrac 60", "Eicher 485"];

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(lambda: number, rnd: () => number): number {
  if (lambda <= 0) return 0;
  if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * gauss(rnd)));
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rnd();
  } while (p > limit);
  return k - 1;
}

function gauss(rnd: () => number): number {
  const u = Math.max(1e-12, rnd());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

/** Round to the step a supplier would sell in: 1, 5, 10, 25, 50, 100. */
function niceQty(n: number): number {
  if (n <= 5) return Math.max(1, Math.round(n));
  const step = n <= 30 ? 5 : n <= 120 ? 10 : n <= 300 ? 25 : n <= 800 ? 50 : 100;
  return Math.max(step, Math.round(n / step) * step);
}

function stochasticRound(x: number, rnd: () => number): number {
  const f = Math.floor(x);
  return f + (rnd() < x - f ? 1 : 0);
}

function pick<T>(list: T[], rnd: () => number): T {
  return list[Math.floor(rnd() * list.length)];
}

function weightedIndex(cum: number[], rnd: () => number): number {
  const r = rnd() * cum[cum.length - 1];
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < r) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function cumulative(w: number[]): number[] {
  const out: number[] = [];
  let s = 0;
  for (const x of w) out.push((s += x));
  return out;
}

/** The calendar months covered, oldest first, ending with the month that contains yesterday. */
function monthStarts(today: string, months: number): string[] {
  const y = addDays(today, -1);
  let yr = Number(y.slice(0, 4));
  let mo = Number(y.slice(5, 7));
  const out: string[] = [];
  for (let i = 0; i < months; i++) {
    out.unshift(`${yr}-${String(mo).padStart(2, "0")}-01`);
    mo -= 1;
    if (mo === 0) {
      mo = 12;
      yr -= 1;
    }
  }
  return out;
}

function daysInMonth(start: string): string[] {
  const out: string[] = [];
  for (let d = start; d.slice(0, 7) === start.slice(0, 7); d = addDays(d, 1)) out.push(d);
  return out;
}

function weekday(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = Sunday
}

export function buildDataset(tsfText: string, today: string, opts: BuildOptions = DEFAULT_BUILD): BuiltData {
  const rnd = mulberry32(opts.seed);
  const core = buildSample(today);
  const months = monthStarts(today, opts.months);
  const windowStart = addDays(today, -HISTORY_DAYS);

  // ---- 1. Pick real demand series with enough recent activity to stock. ----
  const all = parseTsf(tsfText);
  const usable = all.filter((s) => {
    const last = s.values.slice(-opts.months);
    return last.filter((v) => v > 0).length >= 5 && last.reduce((a, b) => a + b, 0) >= 10;
  });
  const shuffled = [...usable];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const chosen = shuffled.slice(0, Math.min(opts.longTail, shuffled.length));

  // ---- 2. Give each one a part name, a price and a home in the catalogue. ----
  const products: Product[] = [...core.products];
  const prices = new Map<string, number>();
  for (const s of core.suppliers) prices.set(s.sku, Math.min(prices.get(s.sku) ?? Infinity, s.price));
  const source = new Map<string, string>(core.products.map((p) => [p.sku, "scenario"]));
  const familyOf = new Map<string, Family>();
  const seriesOf = new Map<string, Series>();
  const usedNames = new Set<string>();
  const counters = new Map<string, number>();
  for (const s of chosen) {
    let fam: Family;
    let name: string;
    let machine: string;
    let guard = 0;
    do {
      fam = pick(FAMILIES, rnd);
      name = pick(fam.names, rnd);
      machine = rnd() < fam.universal ? "Universal" : pick(MACHINES, rnd);
      guard++;
    } while (usedNames.has(`${name}|${machine}`) && guard < 50);
    usedNames.add(`${name}|${machine}`);
    const n = (counters.get(fam.prefix) ?? 1000) + 1 + Math.floor(rnd() * 7);
    counters.set(fam.prefix, n);
    const sku = `${fam.prefix}-${n}`;
    products.push({ sku, name, machine_model: machine, category: fam.category });
    const [lo, hi] = fam.price;
    prices.set(sku, Math.round(Math.exp(Math.log(lo) + rnd() * (Math.log(hi) - Math.log(lo)))));
    source.set(sku, `carparts:${s.id}`);
    familyOf.set(sku, fam);
    seriesOf.set(sku, s);
  }

  // ---- 3. Daily sales. ----
  const sales: SaleRow[] = [...core.sales];
  const monthly = new Map<string, number[]>(); // network units per month, for the demand profile

  // 3a. Long-tail parts: real monthly totals, rescaled, split across stores and days.
  for (const [sku, s] of seriesOf) {
    const real = s.values.slice(-opts.months);
    const realMean = real.reduce((a, b) => a + b, 0) / real.length;
    // Kaveri's volume for this part: about 18 a month across the network for a
    // ₹300 part, fewer for dearer ones (a ₹7,000 clutch assembly sells rarely).
    const price = prices.get(sku) as number;
    const target = Math.min(120, Math.max(2, 18 * Math.sqrt(300 / price) * Math.exp(0.7 * gauss(rnd))));
    const factor = target / realMean;
    // Each part sells a little more in some towns than others.
    const skew = STORES.map(([, w]) => w * Math.exp(0.35 * gauss(rnd)));
    const cum = cumulative(skew);
    const perMonth: number[] = [];
    const cells = new Map<string, number>();
    months.forEach((start, j) => {
      const units = stochasticRound(real[j] * factor, rnd);
      perMonth.push(units);
      const days = daysInMonth(start);
      const dayCum = cumulative(days.map((d) => (weekday(d) === 0 ? 0.35 : 1)));
      for (let u = 0; u < units; u++) {
        const d = days[weightedIndex(dayCum, rnd)];
        if (d >= today) continue; // the rest of this month has not happened yet
        const st = STORES[weightedIndex(cum, rnd)][0];
        const k = `${d}|${st}`;
        cells.set(k, (cells.get(k) ?? 0) + 1);
      }
    });
    monthly.set(sku, perMonth);
    for (const [k, qty] of cells) {
      const [date, location] = k.split("|");
      sales.push({ date, sku, location, qty_sold: qty });
    }
  }

  // 3b. Hand-built parts: older history before the scenario window, at their usual pace with a real seasonal shape.
  const coreRate = new Map<string, number>();
  for (const r of core.sales) {
    const back = diffDays(r.date, today);
    if (back > 7) coreRate.set(`${r.sku}|${r.location}`, (coreRate.get(`${r.sku}|${r.location}`) ?? 0) + r.qty_sold / (HISTORY_DAYS - 7));
  }
  for (const p of core.products) {
    const shape = pick(usable, rnd).values.slice(-opts.months);
    const mean = shape.reduce((a, b) => a + b, 0) / shape.length || 1;
    const perMonth = new Array(opts.months).fill(0);
    for (const [store] of STORES) {
      const rate = coreRate.get(`${p.sku}|${store}`) ?? 0;
      if (rate <= 0) continue;
      months.forEach((start, j) => {
        const season = 0.6 + 0.4 * (shape[j] / mean); // soften: these parts sell every week
        for (const d of daysInMonth(start)) {
          if (d >= windowStart) break;
          const qty = poisson(rate * season * (weekday(d) === 0 ? 0.35 : 1.13), rnd);
          if (qty > 0) {
            sales.push({ date: d, sku: p.sku, location: store, qty_sold: qty });
            perMonth[j] += qty;
          }
        }
      });
    }
    for (const r of core.sales) {
      if (r.sku !== p.sku) continue;
      const j = months.indexOf(`${r.date.slice(0, 7)}-01`);
      if (j >= 0) perMonth[j] += r.qty_sold;
    }
    monthly.set(p.sku, perMonth);
  }

  // ---- 4. Stock on hand for the long tail. ----
  const inventory: InventoryRow[] = [...core.inventory];
  const salesBySku = new Map<string, SaleRow[]>();
  for (const r of sales) {
    if (!seriesOf.has(r.sku) || diffDays(r.date, today) > 180) continue;
    const list = salesBySku.get(r.sku) ?? [];
    list.push(r);
    salesBySku.set(r.sku, list);
  }
  for (const sku of seriesOf.keys()) {
    const rows = salesBySku.get(sku) ?? [];
    let network = 0;
    for (const [store] of STORES) {
      // A buyer plans shelf stock from the busier of the last month and the last six.
      // Parts a store sells less than about once a fortnight are not kept on its shelf:
      // the warehouse holds them and sends them on demand (centralised slow movers).
      const here = rows.filter((r) => r.location === store);
      const rate180 = here.reduce((a, r) => a + r.qty_sold, 0) / 180;
      const rate28 = here.filter((r) => diffDays(r.date, today) <= 28).reduce((a, r) => a + r.qty_sold, 0) / 28;
      const rate = Math.max(rate180, rate28);
      network += rate180;
      let stock: number;
      if (rate < 0.02) stock = rnd() < 0.7 ? 0 : 1;
      else if (rate180 < 0.07) stock = Math.ceil(rate * 30) + 1; // a small buffer; the warehouse backs it up
      else stock = Math.ceil(rate * (22 + rnd() * 26));
      inventory.push({ sku, location: store, stock });
    }
    // The main warehouse keeps one to two weeks of network demand; Bagalkot carries little.
    inventory.push({ sku, location: "Hubli Warehouse", stock: Math.round(network * (4 + rnd() * 10)) });
    inventory.push({ sku, location: "Bagalkot Warehouse", stock: rnd() < 0.5 ? 0 : Math.round(network * rnd() * 5) });
  }

  // ---- 5. Supplier offers for the long tail. ----
  const suppliers: SupplierRow[] = [...core.suppliers];
  const networkMonthly = (sku: string) => {
    const m = monthly.get(sku) ?? [];
    return m.slice(-6).reduce((a, b) => a + b, 0) / 6;
  };
  for (const sku of seriesOf.keys()) {
    const fam = familyOf.get(sku) as Family;
    const base = prices.get(sku) as number;
    const nm = Math.max(1, networkMonthly(sku));
    const offer = (supplier: string) => {
      const pr = PROFILE[supplier];
      const [l1, l2] = pr.lead;
      return {
        supplier,
        sku,
        price: Math.round(base * pr.premium * (0.97 + rnd() * 0.06)),
        lead_time_days: l1 + Math.floor(rnd() * (l2 - l1 + 1)),
        moq: niceQty(Math.max(1, nm * pr.moqMult * (0.6 + rnd() * 0.8))),
      };
    };
    suppliers.push(offer(fam.specialist));
    const r = rnd();
    if (r < 0.6) suppliers.push(offer(PIS));
    else if (r < 0.92) suppliers.push(offer(HTL));
    if (rnd() < 0.18 && fam.specialist !== SHR) suppliers.push(offer(rnd() < 0.5 ? HTL : PIS));
  }
  // Keep one offer per supplier and part.
  const seenOffer = new Set<string>();
  const offers = suppliers.filter((s) => {
    const k = `${s.supplier}|${s.sku}`;
    if (seenOffer.has(k)) return false;
    seenOffer.add(k);
    return true;
  });
  for (const s of offers) if (!prices.has(s.sku) || s.price < (prices.get(s.sku) as number)) prices.set(s.sku, s.price);

  // ---- 6. Purchase orders: two years of received history, plus a few open ones. ----
  const poHistory: PoHistoryRow[] = [];
  const purchase_orders: PurchaseOrder[] = [...core.purchase_orders];
  let poNo = 15000;
  const cheapest = (sku: string) => offers.filter((o) => o.sku === sku).sort((a, b) => a.price - b.price)[0];
  for (const p of products) {
    const o = cheapest(p.sku);
    if (!o) continue;
    const pr = PROFILE[o.supplier];
    const perMonth = monthly.get(p.sku) ?? [];
    let owed = 0;
    perMonth.forEach((units, j) => {
      owed += units;
      if (owed < Math.max(o.moq, 1) * 0.8 || j === perMonth.length - 1) return;
      const qty = Math.max(o.moq, niceQty(owed));
      owed = 0;
      const ordered = addDays(months[j], Math.floor(rnd() * 26));
      if (ordered >= today) return;
      const promised = addDays(ordered, o.lead_time_days);
      const late = rnd() < pr.onTime ? 0 : 1 + Math.floor(-Math.log(Math.max(1e-9, rnd())) * pr.delay);
      const received = addDays(promised, late);
      if (received >= today) return;
      poHistory.push({ po: `PO-${poNo++}`, supplier: o.supplier, sku: p.sku, qty, location: "Hubli Warehouse", ordered_date: ordered, promised_date: promised, received_date: received });
    });
  }
  let openNo = 2400;
  for (const sku of seriesOf.keys()) {
    const o = cheapest(sku);
    if (!o || rnd() > 0.07) continue;
    const late = rnd() < 0.12;
    purchase_orders.push({
      po: `PO-${openNo++}`,
      supplier: o.supplier,
      sku,
      qty: Math.max(o.moq, niceQty(networkMonthly(sku))),
      expected_date: late ? addDays(today, -(1 + Math.floor(rnd() * 4))) : addDays(today, 1 + Math.floor(rnd() * 12)),
      status: "open",
      location: "Hubli Warehouse",
    });
  }

  // ---- 7. Demand profile and ABC class for every part. ----
  const value12 = new Map<string, number>();
  for (const p of products) value12.set(p.sku, (monthly.get(p.sku) ?? []).slice(-12).reduce((a, b) => a + b, 0) * (prices.get(p.sku) ?? 0));
  const ranked = [...value12.entries()].sort((a, b) => b[1] - a[1]);
  const totalValue = ranked.reduce((a, [, v]) => a + v, 0) || 1;
  const abc = new Map<string, "A" | "B" | "C">();
  let running = 0;
  for (const [sku, v] of ranked) {
    running += v;
    abc.set(sku, running / totalValue <= 0.8 ? "A" : running / totalValue <= 0.95 ? "B" : "C");
  }
  const meta: ProductMeta[] = products.map((p) => {
    const prof = demandProfile(monthly.get(p.sku) ?? []);
    return {
      ...p,
      demand_class: prof.cls,
      adi: Number.isFinite(prof.adi) ? Math.round(prof.adi * 100) / 100 : 99,
      cv2: Math.round(prof.cv2 * 100) / 100,
      abc: abc.get(p.sku) ?? "C",
      source: source.get(p.sku) ?? "scenario",
      unit_price: prices.get(p.sku) ?? 0,
    };
  });

  const supplierInfo: SupplierInfo[] = Object.entries(PROFILE).map(([supplier, pr]) => ({ supplier, city: pr.city, lang: pr.lang, on_time_target: pr.onTime }));

  return {
    asOf: today,
    dataset: { products: meta.map(({ sku, name, machine_model, category, demand_class }) => ({ sku, name, machine_model, category, demand_class })), inventory, sales, suppliers: offers, purchase_orders, transfers: [] },
    products: meta,
    suppliers: supplierInfo,
    poHistory,
    seriesUsed: chosen.length,
    seriesAvailable: all.length,
  };
}

/** Average daily sales per part and store over the last `days` days. */
export function longRatesOf(sales: SaleRow[], today: string, days = 180): LongRate[] {
  const from = addDays(today, -days);
  const sum = new Map<string, number>();
  for (const s of sales) {
    if (s.date < from || s.date >= today) continue;
    const k = `${s.sku}|${s.location}`;
    sum.set(k, (sum.get(k) ?? 0) + s.qty_sold);
  }
  return [...sum].map(([k, v]) => {
    const [sku, location] = k.split("|");
    return { sku, location, rate180: Math.round((v / days) * 1000) / 1000 };
  });
}

/** The slice of the books the agent reads each morning: five weeks of sales plus the six-month rates. */
export function windowOf(data: Dataset, today: string, days = HISTORY_DAYS): Dataset {
  const from = addDays(today, -days);
  return { ...data, sales: data.sales.filter((s) => s.date >= from && s.date < today), longRates: longRatesOf(data.sales, today) };
}
