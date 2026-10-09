import { addDays } from "./dates";
import type { Dataset, InventoryRow, Product, PurchaseOrder, SaleRow, SupplierRow } from "./types";

// Sample data for Kaveri Spares & Hydraulics, in exactly the five record
// shapes the business keeps. It is rebuilt relative to "today" so the demo
// never looks stale, and it is seeded so every run gives the same morning.

const PRODUCTS: (Product & { rate: number })[] = [
  { sku: "HF-220", name: "Hydraulic oil filter", machine_model: "JCB 3DX", category: "Filters", rate: 2.0 },
  { sku: "HS-114", name: "Hydraulic hose 1/2 inch", machine_model: "Universal", category: "Hoses", rate: 3.0 },
  { sku: "SK-330", name: "Boom cylinder seal kit", machine_model: "JCB 3DX", category: "Seals", rate: 1.0 },
  { sku: "HP-410", name: "Hydraulic gear pump", machine_model: "Mahindra 575 DI", category: "Pumps", rate: 0.15 },
  { sku: "OF-101", name: "Engine oil filter", machine_model: "Tata Hitachi EX200", category: "Filters", rate: 1.5 },
  { sku: "AF-150", name: "Air filter", machine_model: "Mahindra 575 DI", category: "Filters", rate: 2.0 },
  { sku: "BR-072", name: "Ball bearing 6207", machine_model: "Universal", category: "Bearings", rate: 1.8 },
  { sku: "VB-240", name: "Fan belt", machine_model: "Swaraj 744", category: "Belts", rate: 0.8 },
  { sku: "CV-300", name: "Control valve", machine_model: "JCB 3DX", category: "Valves", rate: 0.12 },
  { sku: "QC-018", name: "Quick coupler 1/2 inch", machine_model: "Universal", category: "Fittings", rate: 1.2 },
  { sku: "OR-500", name: "O-ring kit", machine_model: "Universal", category: "Seals", rate: 0.2 },
  { sku: "HO-068", name: "Hydraulic oil 68 (20 L)", machine_model: "Universal", category: "Oils", rate: 1.0 },
  { sku: "PT-610", name: "PTO shaft", machine_model: "John Deere 5310", category: "Drivetrain", rate: 0 },
  { sku: "TP-090", name: "Tie-rod end", machine_model: "Mahindra 575 DI", category: "Steering", rate: 0.6 },
];

const CSF = "Coimbatore Seals & Filters";
const SHR = "Shree Hydraulics";
const DAP = "Deccan Auto Parts";
const PIS = "Peenya Industrial Supplies";
const HTL = "Hubli Trade Link";

const SUPPLIERS: SupplierRow[] = [
  { supplier: CSF, sku: "HF-220", price: 310, lead_time_days: 7, moq: 50 },
  { supplier: HTL, sku: "HF-220", price: 365, lead_time_days: 3, moq: 10 },
  { supplier: DAP, sku: "HS-114", price: 182, lead_time_days: 8, moq: 500 },
  { supplier: SHR, sku: "HS-114", price: 198, lead_time_days: 6, moq: 100 },
  { supplier: HTL, sku: "HS-114", price: 236, lead_time_days: 2, moq: 20 },
  { supplier: SHR, sku: "SK-330", price: 840, lead_time_days: 6, moq: 20 },
  { supplier: CSF, sku: "SK-330", price: 905, lead_time_days: 4, moq: 10 },
  { supplier: SHR, sku: "HP-410", price: 5600, lead_time_days: 9, moq: 2 },
  { supplier: PIS, sku: "HP-410", price: 5950, lead_time_days: 5, moq: 1 },
  { supplier: CSF, sku: "OF-101", price: 420, lead_time_days: 7, moq: 40 },
  { supplier: PIS, sku: "OF-101", price: 455, lead_time_days: 4, moq: 20 },
  { supplier: CSF, sku: "AF-150", price: 275, lead_time_days: 7, moq: 50 },
  { supplier: HTL, sku: "AF-150", price: 320, lead_time_days: 2, moq: 10 },
  { supplier: DAP, sku: "BR-072", price: 176, lead_time_days: 8, moq: 100 },
  { supplier: PIS, sku: "BR-072", price: 190, lead_time_days: 5, moq: 50 },
  { supplier: DAP, sku: "VB-240", price: 240, lead_time_days: 8, moq: 30 },
  { supplier: HTL, sku: "VB-240", price: 285, lead_time_days: 2, moq: 5 },
  { supplier: SHR, sku: "CV-300", price: 6800, lead_time_days: 9, moq: 2 },
  { supplier: PIS, sku: "CV-300", price: 7150, lead_time_days: 5, moq: 1 },
  { supplier: PIS, sku: "QC-018", price: 330, lead_time_days: 5, moq: 25 },
  { supplier: HTL, sku: "QC-018", price: 372, lead_time_days: 2, moq: 10 },
  { supplier: DAP, sku: "OR-500", price: 520, lead_time_days: 8, moq: 400 },
  { supplier: PIS, sku: "OR-500", price: 562, lead_time_days: 5, moq: 40 },
  { supplier: DAP, sku: "HO-068", price: 2150, lead_time_days: 9, moq: 20 },
  { supplier: HTL, sku: "HO-068", price: 2290, lead_time_days: 2, moq: 5 },
  { supplier: SHR, sku: "PT-610", price: 4200, lead_time_days: 9, moq: 2 },
  { supplier: DAP, sku: "TP-090", price: 460, lead_time_days: 8, moq: 20 },
  { supplier: PIS, sku: "TP-090", price: 498, lead_time_days: 5, moq: 10 },
];

const STORES: [string, number][] = [
  ["Gokak", 1.0],
  ["Belgaum", 1.3],
  ["Dharwad", 1.1],
  ["Gadag", 0.8],
  ["Vijayapura", 1.0],
  ["Haveri", 0.7],
];

// The messy parts of the morning. `before` is the daily rate up to a week
// ago, `now` is the rate over the last seven days.
type Override = { before: number; now: number; stock: number };
const OVERRIDES: Record<string, Override> = {
  "HF-220|Gokak": { before: 4, now: 4, stock: 8 },
  "HF-220|Belgaum": { before: 0.3, now: 0.3, stock: 140 },
  "SK-330|Dharwad": { before: 2.2, now: 2.2, stock: 6 },
  "HS-114|Vijayapura": { before: 3, now: 8, stock: 30 },
  "CV-300|Gadag": { before: 0.05, now: 0, stock: 14 },
  "CV-300|Belgaum": { before: 0.5, now: 0.5, stock: 12 },
  "AF-150|Haveri": { before: 1.4, now: 4.5, stock: 120 },
  "OF-101|Gadag": { before: 5, now: 1, stock: 90 },
  "BR-072|Dharwad": { before: 2, now: 2, stock: 20 },
  "HO-068|Haveri": { before: 2.5, now: 2.5, stock: 5 },
  "PT-610|Haveri": { before: 0, now: 0, stock: 9 },
  "PT-610|Belgaum": { before: 0.05, now: 0, stock: 2 },
};

// Warehouse stock that differs from the usual buffer.
const WAREHOUSE_STOCK: Record<string, number> = {
  "HF-220|Hubli Warehouse": 6,
  "HF-220|Bagalkot Warehouse": 0,
  "SK-330|Hubli Warehouse": 10,
  "SK-330|Bagalkot Warehouse": 0,
  "HS-114|Hubli Warehouse": 40,
  "HS-114|Bagalkot Warehouse": 60,
  "HO-068|Hubli Warehouse": 0,
  "HO-068|Bagalkot Warehouse": 0,
  "PT-610|Hubli Warehouse": 0,
  "PT-610|Bagalkot Warehouse": 0,
  "OR-500|Hubli Warehouse": 30,
};

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
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rnd();
  } while (p > limit);
  return k - 1;
}

export const HISTORY_DAYS = 35;

export function buildSample(today: string): Dataset {
  const rnd = mulberry32(4026);
  const inventory: InventoryRow[] = [];
  const sales: SaleRow[] = [];

  for (const p of PRODUCTS) {
    let network = 0;
    for (const [store, factor] of STORES) {
      const key = `${p.sku}|${store}`;
      const o = OVERRIDES[key];
      const base = p.rate * factor;
      network += o ? o.now : base;
      // Hydraulic oil is deliberately kept lean everywhere, so no store has any to spare.
      const coverDays = p.sku === "HO-068" ? 20 : 34 + Math.floor(rnd() * 18);
      const stock = o ? o.stock : Math.ceil(base * coverDays);
      if (stock > 0 || base > 0) inventory.push({ sku: p.sku, location: store, stock });

      let carry = 0;
      for (let d = HISTORY_DAYS; d >= 1; d--) {
        let qty: number;
        if (o || p.sku === "HO-068") {
          // Scenario rows follow their rate exactly so the story stays readable.
          carry += o ? (d <= 7 ? o.now : o.before) : base;
          qty = Math.floor(carry + 1e-9);
          carry -= qty;
        } else {
          qty = poisson(base, rnd);
        }
        if (qty > 0) sales.push({ date: addDays(today, -d), sku: p.sku, location: store, qty_sold: qty });
      }
    }
    for (const [wh, days] of [["Hubli Warehouse", 12], ["Bagalkot Warehouse", 6]] as [string, number][]) {
      const key = `${p.sku}|${wh}`;
      const stock = key in WAREHOUSE_STOCK ? WAREHOUSE_STOCK[key] : Math.ceil(network * days);
      inventory.push({ sku: p.sku, location: wh, stock });
    }
  }

  const purchase_orders: PurchaseOrder[] = [
    { po: "PO-2280", supplier: CSF, sku: "AF-150", qty: 150, expected_date: addDays(today, -12), status: "received", location: "Hubli Warehouse" },
    { po: "PO-2291", supplier: SHR, sku: "SK-330", qty: 60, expected_date: addDays(today, -5), status: "open", location: "Dharwad" },
    { po: "PO-2298", supplier: PIS, sku: "BR-072", qty: 100, expected_date: addDays(today, 4), status: "open", location: "Hubli Warehouse" },
    { po: "PO-2304", supplier: DAP, sku: "OR-500", qty: 400, expected_date: addDays(today, 6), status: "open", location: "Hubli Warehouse" },
    { po: "PO-2310", supplier: CSF, sku: "OF-101", qty: 120, expected_date: addDays(today, 3), status: "open", location: "Gadag" },
  ];

  return {
    products: PRODUCTS.map(({ rate: _rate, ...p }) => p),
    inventory,
    sales,
    suppliers: SUPPLIERS.map((s) => ({ ...s })),
    purchase_orders,
    transfers: [],
  };
}
