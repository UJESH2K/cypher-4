"use client";

import { Database, ExternalLink, FlaskConical, Gauge, LoaderCircle } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { type Key, type Lang, localeOf, num, t } from "@/lib/i18n";

type Stats = {
  tables: Record<string, number>;
  sales_from: string;
  sales_to: string;
  units_sold: number;
  demand_classes: Record<string, number>;
  abc: Record<string, number>;
  real_demand_parts: number;
  suppliers: { supplier: string; orders: number; on_time: number; avg_days_late: number; avg_lead: number }[];
  last_run: { at: string; duration_ms: number; records_read: number; problems: number; triggered_by: string } | null;
  meta: { real_series_available?: number; source?: { doi?: string } } | null;
};

function longDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
  } catch {
    return iso;
  }
}

const CLASSES = ["smooth", "erratic", "intermittent", "lumpy"] as const;

/** Where the data comes from and what is in the database. Read live from /api/insights. */
export default function SourcesPanel({ lang }: { lang: Lang }) {
  const T = (k: Key, v?: Record<string, string | number>) => t(lang, k, v);
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/insights", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((s: Stats) => !cancelled && setStats(s))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return <p className="note-line" style={{ paddingTop: 16 }}>{T("src.offline")}</p>;
  if (!stats)
    return (
      <p className="note-line" role="status" style={{ paddingTop: 16, display: "flex", gap: 8, alignItems: "center" }}>
        <LoaderCircle size={16} className="spin" aria-hidden="true" />
        {T("src.loading")}
      </p>
    );

  const locale = localeOf(lang);
  const total = stats.meta?.real_series_available ?? 2674;
  const classTotal = CLASSES.reduce((a, c) => a + (stats.demand_classes[c] ?? 0), 0) || 1;
  const doi = stats.meta?.source?.doi ?? "10.5281/zenodo.4656021";

  return (
    <div className="sources">
      <div className="grid-2">
        <section className="src-card">
          <h3>
            <FlaskConical size={17} aria-hidden="true" />
            {T("src.real.title")}
          </h3>
          <p>{T("src.real.body", { n: num(stats.real_demand_parts), total: num(total) })}</p>
          <a className="link" href={`https://doi.org/${doi}`} target="_blank" rel="noreferrer">
            doi.org/{doi}
            <ExternalLink size={13} aria-hidden="true" />
          </a>
        </section>
        <section className="src-card">
          <h3>
            <Gauge size={17} aria-hidden="true" />
            {T("src.gen.title")}
          </h3>
          <p>{T("src.gen.body")}</p>
        </section>
      </div>

      <section className="src-card">
        <h3>
          <Database size={17} aria-hidden="true" />
          {T("src.db.title")}
        </h3>
        <div className="src-counts">
          {Object.entries(stats.tables).map(([name, n], i) => (
            <motion.div key={name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <b>{num(n)}</b>
              <span className="mono">{name}</span>
            </motion.div>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 12 }}>
          {T("src.range", { from: longDate(stats.sales_from, locale), to: longDate(stats.sales_to, locale), units: num(stats.units_sold) })}
        </p>
      </section>

      <section className="src-card">
        <h3>{T("src.classes.title")}</h3>
        <p>{T("src.classes.body", { total: num(total) })}</p>
        <div className="classbar" role="img" aria-label={CLASSES.map((c) => `${T(`dc.${c}` as Key)}: ${stats.demand_classes[c] ?? 0}`).join(", ")}>
          {CLASSES.map((c) => {
            const n = stats.demand_classes[c] ?? 0;
            if (!n) return null;
            return (
              <motion.span key={c} className={`dc-${c}`} initial={{ width: 0 }} animate={{ width: `${(n / classTotal) * 100}%` }} transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }} />
            );
          })}
        </div>
        <div className="legend" style={{ marginTop: 10 }}>
          {CLASSES.map((c) => (
            <span key={c}>
              <i className={`dc-${c}`} />
              {T(`dc.${c}` as Key)} · {num(stats.demand_classes[c] ?? 0)}
            </span>
          ))}
        </div>
      </section>

      <section className="src-card">
        <h3>{T("src.suppliers.title")}</h3>
        <div className="table-wrap" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{T("col.supplier")}</th>
                <th scope="col" className="num">{T("src.col.orders")}</th>
                <th scope="col" className="num">{T("src.col.ontime")}</th>
                <th scope="col" className="num">{T("src.col.late")}</th>
                <th scope="col" className="num">{T("src.col.lead")}</th>
              </tr>
            </thead>
            <tbody>
              {stats.suppliers.map((s) => (
                <tr key={s.supplier}>
                  <td data-label={T("col.supplier")}>{s.supplier}</td>
                  <td data-label={T("src.col.orders")} className="num">{num(s.orders)}</td>
                  <td data-label={T("src.col.ontime")} className="num">
                    <span className={`chip ${s.on_time >= 0.85 ? "green" : s.on_time >= 0.75 ? "amber" : "red"}`}>{Math.round(s.on_time * 100)}%</span>
                  </td>
                  <td data-label={T("src.col.late")} className="num">{num(s.avg_days_late)}</td>
                  <td data-label={T("src.col.lead")} className="num">{t(lang, "unit.day.other", { n: num(s.avg_lead) })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {stats.last_run && (
        <section className="src-card">
          <h3>{T("src.run.title")}</h3>
          <p>
            <span className="mono" style={{ marginRight: 8 }}>
              {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(stats.last_run.at))}
            </span>
            {T("src.run.body", { records: num(stats.last_run.records_read), problems: stats.last_run.problems, ms: stats.last_run.duration_ms, by: stats.last_run.triggered_by ?? "" })}
          </p>
        </section>
      )}
    </div>
  );
}
