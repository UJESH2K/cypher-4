import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { classify, demandProfile, parseTsf } from "../lib/data/carparts";
import { buildDataset, longRatesOf, windowOf } from "../lib/data/generate";
import { analyse } from "../lib/engine";
import { DEFAULT_SETTINGS } from "../lib/types";

const TSF = readFileSync(new URL("../data/carparts/car_parts_dataset_without_missing_values.tsf", import.meta.url), "utf8");
const TODAY = "2026-10-09";

test("the real car-parts file parses into 2,674 series of 51 months", () => {
  const all = parseTsf(TSF);
  assert.equal(all.length, 2674);
  assert.ok(all.every((s) => s.values.length === 51));
  assert.equal(all[0].start, "1998-01-01");
});

test("demand classes follow the Syntetos-Boylan cut-offs", () => {
  assert.equal(classify(1.0, 0.2), "smooth");
  assert.equal(classify(1.0, 0.9), "erratic");
  assert.equal(classify(3, 0.2), "intermittent");
  assert.equal(classify(3, 0.9), "lumpy");
  assert.equal(demandProfile([0, 0, 0]).cls, "none");
  const p = demandProfile([0, 2, 0, 2, 0, 2]); // sells every other month, same size
  assert.equal(p.adi, 2);
  assert.equal(p.cv2, 0);
  assert.equal(p.cls, "intermittent");
});

test("not one real spare part sells smoothly: every series is intermittent or lumpy", () => {
  const classes = new Set(parseTsf(TSF).map((s) => demandProfile(s.values).cls));
  assert.deepEqual([...classes].sort(), ["intermittent", "lumpy"]);
});

test("the generated books are deterministic and keep the challenge's morning on top", () => {
  const a = buildDataset(TSF, TODAY);
  const b = buildDataset(TSF, TODAY);
  assert.equal(a.dataset.sales.length, b.dataset.sales.length);
  assert.deepEqual(a.dataset.inventory.slice(0, 50), b.dataset.inventory.slice(0, 50));
  assert.equal(a.seriesUsed, 320);
  assert.ok(a.dataset.sales.length > 100_000, "two years of daily sales");
  assert.ok(a.dataset.sales.every((s) => s.date < TODAY), "no sales dated today or later");

  const issues = analyse(windowOf(a.dataset, TODAY), DEFAULT_SETTINGS, TODAY).issues;
  const ids = issues.slice(0, 5).map((i) => i.id);
  assert.ok(ids.includes("stockout|HF-220|Gokak"), "the brief's Gokak filter is in the top five");
  const kinds = new Set(issues.map((i) => i.kind));
  assert.ok(kinds.size >= 5, "at least five kinds of problem in the larger business");
});

test("judging bursty parts on six months removes false dead-stock alarms", () => {
  const built = buildDataset(TSF, TODAY);
  const withLong = windowOf(built.dataset, TODAY);
  const without = { ...withLong, longRates: undefined };
  const slow = (d: typeof withLong) => analyse(d, DEFAULT_SETTINGS, TODAY).issues.filter((i) => i.kind === "slow_stock").length;
  assert.ok(slow(withLong) < slow(without) / 3, `six-month view: ${slow(withLong)} vs four-week view: ${slow(without)}`);
  // The hand-built slow stock that really is slow is still caught.
  const ids = analyse(withLong, DEFAULT_SETTINGS, TODAY).issues.map((i) => i.id);
  assert.ok(ids.includes("slow_stock|CV-300|Gadag"));
});

test("six-month rates average over 180 days", () => {
  const rates = longRatesOf([{ date: "2026-10-01", sku: "A", location: "Gokak", qty_sold: 90 }], TODAY);
  assert.deepEqual(rates, [{ sku: "A", location: "Gokak", rate180: 0.5 }]);
});
