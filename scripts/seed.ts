// Loads Kaveri's books into Supabase.
//
//   npm run db:seed
//
// Needs SUPABASE_URL and SUPABASE_SECRET_KEY (from .env.local or the environment)
// and the schema in supabase/migrations/0001_kaveri_desk.sql. Re-running it
// replaces everything with a fresh morning dated today (India time).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { accountsForSeeding } from "../lib/auth/users";
import { buildDataset, DEFAULT_BUILD, windowOf } from "../lib/data/generate";
import { addDays } from "../lib/dates";
import { analyse } from "../lib/engine";
import { LOCATIONS } from "../lib/geo";
import { DEFAULT_SETTINGS } from "../lib/types";

function loadEnv() {
  try {
    for (const line of readFileSync(resolve(".env.local"), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // No .env.local: rely on the environment.
  }
}

function istToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

loadEnv();
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SECRET_KEY (see .env.example).");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

async function clear(table: string, column: string) {
  const { error } = await db.from(table).delete().not(column, "is", null);
  if (error) throw new Error(`clear ${table}: ${error.message}`);
}

async function insert(table: string, rows: object[], chunk = 2000) {
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await db.from(table).insert(rows.slice(i, i + chunk));
    if (error) throw new Error(`insert ${table} rows ${i}-${i + chunk}: ${error.message}`);
    if (rows.length > chunk * 3) process.stdout.write(`\r  ${table}: ${Math.min(rows.length, i + chunk).toLocaleString("en-IN")} / ${rows.length.toLocaleString("en-IN")}`);
  }
  if (rows.length > chunk * 3) process.stdout.write("\n");
  console.log(`  ${table}: ${rows.length.toLocaleString("en-IN")} rows`);
}

async function main() {
  const t0 = Date.now();
  const today = istToday();
  const tsf = readFileSync(resolve("data/carparts/car_parts_dataset_without_missing_values.tsf"), "utf8");
  const built = buildDataset(tsf, today, DEFAULT_BUILD);
  const d = built.dataset;
  console.log(`Built the books for ${today}: ${d.products.length} parts (${built.seriesUsed} driven by real demand series), ${d.sales.length.toLocaleString("en-IN")} sales rows.`);

  console.log("Clearing old data");
  for (const [t, c] of [
    ["decisions", "id"], ["handled_issues", "issue_id"], ["rejections", "issue_id"], ["approval_requests", "issue_id"], ["agent_runs", "id"],
    ["transfers", "id"], ["sales", "date"], ["inventory", "sku"], ["supplier_offers", "sku"], ["purchase_orders", "po"], ["po_history", "po"],
    ["seed_inventory", "sku"], ["seed_purchase_orders", "po"], ["seed_supplier_offers", "sku"], ["seed_sales_window", "sku"],
    ["products", "sku"], ["suppliers", "supplier"], ["locations", "name"], ["app_users", "id"], ["app_settings", "id"], ["dataset_meta", "key"],
  ] as const) await clear(t, c);

  console.log("Loading");
  await insert("locations", LOCATIONS.map((l) => ({ name: l.name, kind: l.kind, lat: l.lat, lon: l.lon, lang: l.lang })));
  await insert("suppliers", built.suppliers);
  await insert("products", built.products);
  await insert("supplier_offers", d.suppliers);
  await insert("inventory", d.inventory);
  await insert("sales", d.sales, 5000);
  await insert("purchase_orders", d.purchase_orders.map((p) => ({ ...p, location: p.location || "Hubli Warehouse" })));
  await insert("po_history", built.poHistory);
  await insert("app_users", accountsForSeeding());
  await insert("app_settings", [{ id: 1, value: DEFAULT_SETTINGS }]);

  const windowFrom = addDays(today, -35);
  await insert("seed_inventory", d.inventory);
  await insert("seed_purchase_orders", d.purchase_orders.map((p) => ({ ...p, location: p.location || "Hubli Warehouse" })));
  await insert("seed_supplier_offers", d.suppliers);
  await insert("seed_sales_window", d.sales.filter((s) => s.date >= windowFrom && s.date < today), 5000);

  const classes: Record<string, number> = {};
  for (const p of built.products) classes[p.demand_class] = (classes[p.demand_class] ?? 0) + 1;
  await insert("dataset_meta", [
    {
      key: "dataset",
      value: {
        as_of: today,
        built_at: new Date().toISOString(),
        months_of_history: DEFAULT_BUILD.months,
        parts: d.products.length,
        real_demand_parts: built.seriesUsed,
        real_series_available: built.seriesAvailable,
        demand_classes: classes,
        source: {
          name: "Car parts demand, Monash Time Series Forecasting Archive",
          doi: "10.5281/zenodo.4656021",
          original: "Hyndman (2015), expsmooth R package",
          licence: "CC BY 4.0",
        },
      },
    },
    { key: "default_settings", value: DEFAULT_SETTINGS },
  ]);

  // Prove it end to end: read the books back exactly as the app does and run the agent.
  const { data: snap, error } = await db.rpc("api_snapshot", { window_days: 35 });
  if (error) throw new Error(`api_snapshot: ${error.message}`);
  const local = windowOf(d, today);
  const a = analyse({ ...snap, longRates: snap.longRates }, DEFAULT_SETTINGS, today);
  const b = analyse(local, DEFAULT_SETTINGS, today);
  console.log(`Agent on the database: ${a.issues.length} problems; on the generated data: ${b.issues.length}. Top three: ${a.issues.slice(0, 3).map((i) => i.id).join(", ")}`);
  if (a.issues.length !== b.issues.length) console.warn("Warning: the database and the generated data disagree.");
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
