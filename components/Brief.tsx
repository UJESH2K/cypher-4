"use client";

import { useEffect, useState } from "react";
import { formatLongDate } from "@/lib/dates";
import { type Key, type Lang, localeOf, money, num, t } from "@/lib/i18n";
import { issueTitle, optionLabel } from "@/lib/present";
import type { Analysis, Dataset, Issue } from "@/lib/types";

type Props = {
  lang: Lang;
  analysis: Analysis;
  data: Dataset;
  open: Issue[];
  doneCount: number;
  run: number;
  onRecheck: () => void;
};

/** True when the browser has a voice for this language, so "Listen" never plays silence. */
function useVoice(lang: Lang) {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const check = () => setOk(window.speechSynthesis.getVoices().some((v) => v.lang.toLowerCase().startsWith(lang)));
    check();
    window.speechSynthesis.addEventListener("voiceschanged", check);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", check);
  }, [lang]);
  return ok;
}

export default function Brief({ lang, analysis, data, open, doneCount, run, onRecheck }: Props) {
  const T = (k: Key, v?: Record<string, string | number>) => t(lang, k, v);
  const [speaking, setSpeaking] = useState(false);
  const hasVoice = useVoice(lang);
  const top = open.slice(0, 3);
  const s = analysis.stats;

  const headline = top.length === 0 ? T("brief.headline.none") : top.length === 1 ? T("brief.headline.one") : T("brief.headline.n", { n: top.length });
  const read =
    open.length === 0 && analysis.issues.length === 0
      ? T("brief.none")
      : T("brief.read", { sales: num(s.salesRows), stock: num(s.stockLines), prices: num(s.supplierLines), pos: num(s.openPOs), issues: analysis.issues.length });

  const risk = open.filter((i) => i.kind === "stockout" || i.kind === "overdue_po").reduce((n, i) => n + i.impact, 0);
  const stuck = open.filter((i) => i.kind === "slow_stock").reduce((n, i) => n + Number(i.facts.cash), 0);

  const steps: [Key, Key, number][] = [
    ["step.observe", "step.observe.d", s.salesRows + s.stockLines + s.supplierLines + data.purchase_orders.length + data.products.length],
    ["step.reason", "step.reason.d", analysis.issues.length],
    ["step.evaluate", "step.evaluate.d", s.optionsCompared],
    ["step.decide", "step.decide.d", s.drafts],
    ["step.act", "step.act.d", open.filter((i) => i.recommended).length],
    ["step.explain", "step.explain.d", open.length],
  ];

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const listen = () => {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const lines = [T("brief.greeting"), headline];
    top.forEach((i) => {
      const rec = i.options.find((o) => o.id === i.recommended);
      lines.push(issueTitle(lang, i, data) + ".");
      if (rec) lines.push(T("chat.a.recommend", { action: optionLabel(lang, rec, i) }));
    });
    const u = new SpeechSynthesisUtterance(lines.join(" "));
    u.lang = localeOf(lang);
    u.rate = 0.95;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(u);
    setSpeaking(true);
  };

  return (
    <section className="brief" aria-labelledby="brief-title">
      <div className="wrap">
        <div className="brief-grid">
          <div>
            <p className="brief-date">{formatLongDate(analysis.asOf, localeOf(lang))}</p>
            <h1 id="brief-title">
              <span className="hello">{T("brief.greeting")}</span>
              {headline}
            </h1>
            <p className="brief-read">{read}</p>
            <div className="brief-actions">
              <button className="btn ghost" onClick={onRecheck}>
                {T("brief.recheck")}
              </button>
              {hasVoice && (
                <button className="btn ghost" onClick={listen} aria-pressed={speaking}>
                  {speaking ? T("brief.stop") : T("brief.listen")}
                </button>
              )}
            </div>
          </div>
          <dl className="totals">
            <div>
              <dt className="total-label">{T("total.risk")}</dt>
              <dd className="total-num">{money(risk)}</dd>
            </div>
            <div>
              <dt className="total-label">{T("total.stuck")}</dt>
              <dd className="total-num">{money(stuck)}</dd>
            </div>
            <div>
              <dt className="total-label">{T("total.waiting")}</dt>
              <dd className="total-num">{open.length}</dd>
            </div>
            <div>
              <dt className="total-label">{T("total.done")}</dt>
              <dd className="total-num">{doneCount}</dd>
            </div>
          </dl>
        </div>
        <ol className="loop" key={run}>
          {steps.map(([name, what, n], i) => (
            <li key={name} style={{ animationDelay: `${i * 140}ms` }}>
              <span className="loop-n">{i + 1}</span>
              <span>
                <span className="loop-name">{T(name)}</span>
                <span className="loop-what">{T(what, { n: num(n) })}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
