import type { Dataset, Option } from "./types";

/**
 * Carry out an approved option against the (simulated) books. Nothing here
 * talks to a real supplier or ERP: a PO becomes an open order, a transfer
 * leaves the lending shelf and shows as inbound at the receiving one.
 */
export function applyOption(data: Dataset, option: Option): Dataset {
  const next: Dataset = {
    ...data,
    inventory: data.inventory.map((r) => ({ ...r })),
    purchase_orders: data.purchase_orders.map((p) => ({ ...p })),
    transfers: [...data.transfers],
  };
  for (const a of option.actions) {
    if (a.type === "po") {
      next.purchase_orders.push({
        po: a.po,
        supplier: a.supplier,
        sku: a.sku,
        qty: a.qty,
        expected_date: a.expected_date,
        status: "open",
        location: a.location,
      });
    } else if (a.type === "transfer") {
      const row = next.inventory.find((r) => r.sku === a.sku && r.location === a.from);
      if (row) row.stock = Math.max(0, row.stock - a.qty);
      next.transfers.push({ id: a.id, sku: a.sku, from: a.from, to: a.to, qty: a.qty, eta: a.eta });
    } else if (a.type === "enquiry" && a.purpose === "reduce") {
      const po = next.purchase_orders.find((p) => p.po === a.po);
      if (po) po.status = "cancelled";
    }
  }
  return next;
}
