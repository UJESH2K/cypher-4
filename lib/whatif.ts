import { addDays, diffDays } from "./dates";
import { isOpen } from "./engine";
import type { Dataset } from "./types";

// Edits used by the Data screen: each returns a new dataset, and the desk
// simply runs its analysis again. Nothing here knows what the "right" answer is.

/** Replace the last seven days of sales for one part at one place with a steady daily rate. */
export function setRecentRate(data: Dataset, asOf: string, sku: string, location: string, rate: number): Dataset {
  const keep = data.sales.filter((s) => {
    if (s.sku !== sku || s.location !== location) return true;
    const back = diffDays(s.date, asOf);
    return back < 1 || back > 7;
  });
  const added = [];
  let carry = 0;
  for (let d = 7; d >= 1; d--) {
    carry += Math.max(0, rate);
    const qty = Math.floor(carry + 1e-9);
    carry -= qty;
    if (qty > 0) added.push({ date: addDays(asOf, -d), sku, location, qty_sold: qty });
  }
  return { ...data, sales: [...keep, ...added] };
}

/** Every open order is now six days overdue. */
export function ordersOverdue(data: Dataset, asOf: string, daysLate = 6): Dataset {
  return {
    ...data,
    purchase_orders: data.purchase_orders.map((p) => (isOpen(p) ? { ...p, expected_date: addDays(asOf, -daysLate) } : p)),
  };
}

/** Demand at one location doubles for the last week, for every part it sells. */
export function rush(data: Dataset, asOf: string, location: string, factor = 2): Dataset {
  const sums = new Map<string, number>();
  for (const s of data.sales) {
    if (s.location !== location) continue;
    const back = diffDays(s.date, asOf);
    if (back >= 1 && back <= 7) sums.set(s.sku, (sums.get(s.sku) ?? 0) + s.qty_sold);
  }
  let next = data;
  for (const [sku, sum] of sums) next = setRecentRate(next, asOf, sku, location, (sum / 7) * factor);
  return next;
}

export function priceHike(data: Dataset, supplier: string, pct = 20): Dataset {
  return {
    ...data,
    suppliers: data.suppliers.map((s) => (s.supplier === supplier ? { ...s, price: Math.round(s.price * (1 + pct / 100)) } : s)),
  };
}

export function emptyLocation(data: Dataset, location: string): Dataset {
  return { ...data, inventory: data.inventory.map((r) => (r.location === location ? { ...r, stock: 0 } : r)) };
}
