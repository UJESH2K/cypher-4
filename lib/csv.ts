// A small CSV reader and writer: enough for the five record files, including
// quoted fields, without pulling in a dependency.

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const esc = (v: unknown) => {
    const s = v === undefined || v === null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => esc(r[c])).join(","))].join("\n");
}

export const TABLES = {
  products: { columns: ["sku", "name", "machine_model", "category"], numeric: [] as string[], optional: [] as string[] },
  inventory: { columns: ["sku", "location", "stock"], numeric: ["stock"], optional: [] as string[] },
  sales: { columns: ["date", "sku", "location", "qty_sold"], numeric: ["qty_sold"], optional: [] as string[] },
  suppliers: { columns: ["supplier", "sku", "price", "lead_time_days", "moq"], numeric: ["price", "lead_time_days", "moq"], optional: [] as string[] },
  purchase_orders: { columns: ["po", "supplier", "sku", "qty", "expected_date", "status", "location"], numeric: ["qty"], optional: ["location"] },
} as const;

export type TableName = keyof typeof TABLES;

/** Check an uploaded file against the record shape; return typed rows or the missing columns. */
export function readTable(name: TableName, text: string): { rows: Record<string, string | number>[]; missing: string[] } {
  const spec = TABLES[name];
  const raw = parseCsv(text);
  if (!raw.length) return { rows: [], missing: [] };
  const missing = spec.columns.filter((c) => !(c in raw[0]) && !(spec.optional as readonly string[]).includes(c));
  if (missing.length) return { rows: [], missing };
  const rows = raw.map((r) => {
    const out: Record<string, string | number> = {};
    for (const c of spec.columns) {
      const v = r[c] ?? "";
      out[c] = (spec.numeric as readonly string[]).includes(c) ? Number(String(v).replace(/[₹,\s]/g, "")) || 0 : v;
    }
    return out;
  });
  return { rows, missing: [] };
}
