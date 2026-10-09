"use client";

import { useMemo, useRef, useState } from "react";
import { readTable, type TableName, TABLES, toCsv } from "@/lib/csv";
import { buildIndex } from "@/lib/engine";
import { type Key, type Lang, num, place, t } from "@/lib/i18n";
import type { Dataset, Settings } from "@/lib/types";
import { emptyLocation, ordersOverdue, priceHike, rush, setRecentRate } from "@/lib/whatif";

type Props = {
  lang: Lang;
  data: Dataset;
  settings: Settings;
  asOf: string;
  onData: (d: Dataset) => void;
  onSettings: (s: Settings) => void;
  onReset: () => void;
};

type Tab = "inventory" | "sales" | "suppliers" | "pos" | "products" | "assumptions";
const TABS: Tab[] = ["inventory", "sales", "suppliers", "pos", "products", "assumptions"];
const FILE: Record<Exclude<Tab, "assumptions">, TableName> = { inventory: "inventory", sales: "sales", suppliers: "suppliers", pos: "purchase_orders", products: "products" };
const LIMIT = 150;

const ASSUME: [keyof Settings, Key, number][] = [
  ["marginPct", "assume.margin", 1],
  ["lostSaleFactor", "assume.lost", 0.5],
  ["holdingPctYear", "assume.holding", 1],
  ["freightPerKm", "assume.freightKm", 1],
  ["freightMin", "assume.freightMin", 50],
  ["coverDays", "assume.cover", 1],
  ["donorKeepDays", "assume.keep", 1],
  ["slowDays", "assume.slow", 10],
  ["markdownPct", "assume.markdown", 1],
  ["latePoExtraDays", "assume.late", 1],
  ["slowMinCost", "assume.slowMin", 100],
];

/** A number field that only commits a valid, non-negative value. */
function NumCell({ value, label, step = 1, onCommit }: { value: number; label: string; step?: number; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      className="cell-input"
      type="number"
      inputMode="decimal"
      min={0}
      step={step}
      aria-label={label}
      value={draft ?? String(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null) {
          const n = Number(draft);
          if (draft.trim() !== "" && Number.isFinite(n) && n >= 0 && n !== value) onCommit(n);
          setDraft(null);
        }
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

export default function DataView({ lang, data, settings, asOf, onData, onSettings, onReset }: Props) {
  const T = (k: Key, v?: Record<string, string | number>) => t(lang, k, v);
  const [tab, setTab] = useState<Tab>("inventory");
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);

  const names = useMemo(() => new Map(data.products.map((p) => [p.sku, p.name])), [data.products]);
  const part = (sku: string) => names.get(sku) ?? sku;
  const q = filter.trim().toLowerCase();
  const match = (...vals: (string | undefined)[]) => !q || vals.some((v) => (v ?? "").toLowerCase().includes(q));

  const rates = useMemo(() => {
    const ix = buildIndex(data, settings, asOf);
    return [...ix.positions.values()]
      .filter((p) => p.r7 > 0 || p.rPrev > 0)
      .map((p) => ({ sku: p.sku, location: p.location, r7: Math.round(p.r7 * 10) / 10, rPrev: Math.round(p.rPrev * 10) / 10 }))
      .sort((a, b) => a.sku.localeCompare(b.sku) || a.location.localeCompare(b.location));
  }, [data, settings, asOf]);

  const upload = async (f: File | undefined) => {
    if (!f || tab === "assumptions") return;
    setError("");
    const name = FILE[tab];
    try {
      const { rows, missing } = readTable(name, await f.text());
      if (missing.length) return setError(T("data.uploadError", { why: T("data.err.columns", { cols: missing.join(", ") }) }));
      if (!rows.length) return setError(T("data.uploadError", { why: T("data.err.empty") }));
      // A new stock or order file replaces the old one, so in-app transfers no longer apply.
      onData({ ...data, [name]: rows, transfers: name === "inventory" || name === "purchase_orders" ? [] : data.transfers } as Dataset);
    } catch {
      setError(T("data.uploadError", { why: f.name }));
    } finally {
      if (file.current) file.current.value = "";
    }
  };

  const download = () => {
    if (tab === "assumptions") return;
    const name = FILE[tab];
    const blob = new Blob([toCsv(data[name] as unknown as Record<string, unknown>[], [...TABLES[name].columns])], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const patch = <K extends "inventory" | "suppliers" | "purchase_orders">(table: K, index: number, change: Partial<Dataset[K][number]>) => {
    const rows = data[table].map((r, i) => (i === index ? { ...r, ...change } : r));
    onData({ ...data, [table]: rows } as Dataset);
  };

  const head = (cols: [Key, boolean?][]) => (
    <thead>
      <tr>
        {cols.map(([k, numeric]) => (
          <th key={k} scope="col" className={numeric ? "num" : undefined}>
            {T(k)}
          </th>
        ))}
      </tr>
    </thead>
  );

  let body: React.ReactNode = null;
  let shown = 0;
  let total = 0;

  if (tab === "inventory") {
    const rows = data.inventory.map((r, i) => ({ r, i })).filter(({ r }) => match(r.sku, part(r.sku), r.location, place(lang, r.location)));
    total = rows.length;
    shown = Math.min(total, LIMIT);
    body = (
      <table className="table">
        {head([["col.sku"], ["col.name"], ["col.location"], ["col.stock", true]])}
        <tbody>
          {rows.slice(0, LIMIT).map(({ r, i }) => (
            <tr key={`${r.sku}-${r.location}`}>
              <td data-label={T("col.sku")}>{r.sku}</td>
              <td data-label={T("col.name")}>{part(r.sku)}</td>
              <td data-label={T("col.location")}>{place(lang, r.location)}</td>
              <td data-label={T("col.stock")} className="num">
                <NumCell value={r.stock} label={`${T("col.stock")}, ${part(r.sku)}, ${r.location}`} onCommit={(n) => patch("inventory", i, { stock: Math.round(n) })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  } else if (tab === "sales") {
    const rows = rates.filter((r) => match(r.sku, part(r.sku), r.location, place(lang, r.location)));
    total = rows.length;
    shown = Math.min(total, LIMIT);
    body = (
      <>
        <p className="note">{T("data.sales.note")}</p>
        <table className="table">
          {head([["col.sku"], ["col.name"], ["col.location"], ["col.avgPrev", true], ["col.avg7", true]])}
          <tbody>
            {rows.slice(0, LIMIT).map((r) => (
              <tr key={`${r.sku}-${r.location}`}>
                <td data-label={T("col.sku")}>{r.sku}</td>
                <td data-label={T("col.name")}>{part(r.sku)}</td>
                <td data-label={T("col.location")}>{place(lang, r.location)}</td>
                <td data-label={T("col.avgPrev")} className="num">
                  {num(r.rPrev)}
                </td>
                <td data-label={T("col.avg7")} className="num">
                  <NumCell value={r.r7} step={0.5} label={`${T("col.avg7")}, ${part(r.sku)}, ${r.location}`} onCommit={(n) => onData(setRecentRate(data, asOf, r.sku, r.location, n))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  } else if (tab === "suppliers") {
    const rows = data.suppliers.map((r, i) => ({ r, i })).filter(({ r }) => match(r.supplier, r.sku, part(r.sku)));
    total = rows.length;
    shown = Math.min(total, LIMIT);
    body = (
      <table className="table">
        {head([["col.supplier"], ["col.sku"], ["col.name"], ["col.price", true], ["col.lead", true], ["col.moq", true]])}
        <tbody>
          {rows.slice(0, LIMIT).map(({ r, i }) => (
            <tr key={`${r.supplier}-${r.sku}`}>
              <td data-label={T("col.supplier")}>{r.supplier}</td>
              <td data-label={T("col.sku")}>{r.sku}</td>
              <td data-label={T("col.name")}>{part(r.sku)}</td>
              <td data-label={T("col.price")} className="num">
                <NumCell value={r.price} label={`${T("col.price")}, ${r.supplier}, ${r.sku}`} onCommit={(n) => patch("suppliers", i, { price: n })} />
              </td>
              <td data-label={T("col.lead")} className="num">
                <NumCell value={r.lead_time_days} label={`${T("col.lead")}, ${r.supplier}, ${r.sku}`} onCommit={(n) => patch("suppliers", i, { lead_time_days: Math.round(n) })} />
              </td>
              <td data-label={T("col.moq")} className="num">
                <NumCell value={r.moq} label={`${T("col.moq")}, ${r.supplier}, ${r.sku}`} onCommit={(n) => patch("suppliers", i, { moq: Math.max(1, Math.round(n)) })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  } else if (tab === "pos") {
    const rows = data.purchase_orders.map((r, i) => ({ r, i })).filter(({ r }) => match(r.po, r.supplier, r.sku, part(r.sku), r.location));
    total = rows.length;
    shown = Math.min(total, LIMIT);
    body = (
      <table className="table">
        {head([["col.po"], ["col.supplier"], ["col.name"], ["col.location"], ["col.qty", true], ["col.expected"], ["col.status"]])}
        <tbody>
          {rows.slice(0, LIMIT).map(({ r, i }) => (
            <tr key={r.po}>
              <td data-label={T("col.po")}>{r.po}</td>
              <td data-label={T("col.supplier")}>{r.supplier}</td>
              <td data-label={T("col.name")}>{part(r.sku)}</td>
              <td data-label={T("col.location")}>{place(lang, r.location || "Hubli Warehouse")}</td>
              <td data-label={T("col.qty")} className="num">
                <NumCell value={r.qty} label={`${T("col.qty")}, ${r.po}`} onCommit={(n) => patch("purchase_orders", i, { qty: Math.round(n) })} />
              </td>
              <td data-label={T("col.expected")}>
                <input className="cell-input" type="date" aria-label={`${T("col.expected")}, ${r.po}`} value={r.expected_date} onChange={(e) => e.target.value && patch("purchase_orders", i, { expected_date: e.target.value })} />
              </td>
              <td data-label={T("col.status")}>
                <select className="cell-input" aria-label={`${T("col.status")}, ${r.po}`} value={r.status.toLowerCase()} onChange={(e) => patch("purchase_orders", i, { status: e.target.value })}>
                  <option value="open">{T("status.open")}</option>
                  <option value="received">{T("status.received")}</option>
                  <option value="cancelled">{T("status.cancelled")}</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  } else if (tab === "products") {
    const rows = data.products.filter((r) => match(r.sku, r.name, r.machine_model, r.category));
    total = rows.length;
    shown = Math.min(total, LIMIT);
    body = (
      <table className="table">
        {head([["col.sku"], ["col.name"], ["col.machine"], ["col.category"]])}
        <tbody>
          {rows.slice(0, LIMIT).map((r) => (
            <tr key={r.sku}>
              <td data-label={T("col.sku")}>{r.sku}</td>
              <td data-label={T("col.name")}>{r.name}</td>
              <td data-label={T("col.machine")}>{r.machine_model}</td>
              <td data-label={T("col.category")}>{r.category}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <>
      <div className="page-head">
        <h1>{T("data.title")}</h1>
        <p>{T("data.sub")}</p>
      </div>

      <section className="panel" aria-labelledby="surprise">
        <h2 className="block-title" id="surprise">
          {T("surprise.title")}
        </h2>
        <div className="chips">
          <button className="btn" onClick={() => onData(ordersOverdue(data, asOf))}>
            {T("surprise.late")}
          </button>
          <button className="btn" onClick={() => onData(rush(data, asOf, "Dharwad"))}>
            {T("surprise.rush")}
          </button>
          <button className="btn" onClick={() => onData(priceHike(data, "Hubli Trade Link"))}>
            {T("surprise.price")}
          </button>
          <button className="btn" onClick={() => onData(emptyLocation(data, "Hubli Warehouse"))}>
            {T("surprise.count")}
          </button>
          <button className="btn danger" onClick={onReset}>
            {T("data.reset")}
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="subtabs" role="tablist">
          {TABS.map((x) => (
            <button key={x} role="tab" className="subtab" aria-selected={tab === x} onClick={() => { setTab(x); setError(""); }}>
              {T(`data.tab.${x}` as Key)}
            </button>
          ))}
        </div>

        {tab === "assumptions" ? (
          <>
            <p className="note">{T("assume.note")}</p>
            <div className="form">
              {ASSUME.map(([field, label, step]) => (
                <label key={field}>
                  {T(label)}
                  <NumCell value={settings[field]} step={step} label={T(label)} onCommit={(n) => onSettings({ ...settings, [field]: n })} />
                </label>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="toolbar">
              <label className="sr-only" htmlFor="filter">
                {T("data.search")}
              </label>
              <input id="filter" className="input" type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={T("data.search")} />
              <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={(e) => upload(e.target.files?.[0])} />
              <button className="btn" onClick={() => file.current?.click()}>
                {T("data.upload")}
              </button>
              <button className="btn" onClick={download}>
                {T("data.download")}
              </button>
              <span className="count">{T("data.rows", { n: num(total) })}</span>
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {total === 0 ? <p className="empty">{T("data.norows")}</p> : body}
            {total > shown && <p className="count" style={{ marginTop: 12 }}>{T("data.more", { n: shown })}</p>}
          </>
        )}
      </section>
    </>
  );
}
