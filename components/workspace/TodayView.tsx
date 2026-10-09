"use client";

import { ArrowRight, ArrowUpRight, Banknote, CalendarCheck2, Check, ChevronRight, ClipboardList, Hand, Hourglass, RefreshCw, Sparkles, Volume2, VolumeX } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import NetworkMap from "@/components/NetworkMap";
import { CountUp, firstName, issueFigure, KindBadge, kindClass, Loc, tRich, Urgency } from "@/components/ui";
import type { SessionUser } from "@/lib/auth/roles";
import { formatLongDate } from "@/lib/dates";
import { type Key, type Lang, localeOf, money, num, place, t } from "@/lib/i18n";
import { issueTitle, issueWhy, optionLabel } from "@/lib/present";
import type { Analysis, ApprovalRequest, Dataset, Issue } from "@/lib/types";
import AgentLoop from "./AgentLoop";

type Props = {
  lang: Lang;
  user: SessionUser;
  data: Dataset;
  analysis: Analysis;
  open: Issue[];
  doneCount: number;
  requests: ApprovalRequest[];
  mine: boolean;
  run: number;
  checkedAt: Date | null;
  onMine: (v: boolean) => void;
  onOpen: (id: string) => void;
  onAll: () => void;
  onRecheck: () => void;
  onAsk: () => void;
  onPickLocation: (loc: string) => void;
};

/** True when the browser has a voice for this language, so "Listen" never plays silence. */
function useVoice(lang: Lang) {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const check = () => setOk(window.speechSynthesis.getVoices().some((v) => v.lang.toLowerCase().startsWith(lang)));
    check();
    window.speechSynthesis.addEventListener("voiceschanged", check);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", check);
  }, [lang]);
  return ok;
}

function greetingKey(d: Date | null): Key {
  const h = (d ?? new Date()).getHours();
  return h < 12 ? "brief.greeting" : h < 17 ? "greet.afternoon" : "greet.evening";
}

const rise = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: 0.05 + i * 0.06, duration: 0.5, ease: [0.2, 0.8, 0.2, 1] as const } }),
};

export default function TodayView(p: Props) {
  const { lang, user, data, analysis, open } = p;
  const T = (k: Key, v?: Record<string, string | number>) => t(lang, k, v);
  const [speaking, setSpeaking] = useState(false);
  const hasVoice = useVoice(lang);
  const top = open.slice(0, 3);
  const rest = open.slice(3, 8);
  const s = analysis.stats;
  const time = p.checkedAt ? new Intl.DateTimeFormat(localeOf(lang), { hour: "numeric", minute: "2-digit" }).format(p.checkedAt) : "";

  const headline = top.length === 0 ? T("brief.headline.none") : top.length === 1 ? T("brief.headline.one") : T("brief.headline.n", { n: top.length });
  const read =
    analysis.issues.length === 0
      ? T("brief.none")
      : T("brief.read", { sales: num(s.salesRows), stock: num(s.stockLines), prices: num(s.supplierLines), pos: num(s.openPOs), issues: analysis.issues.length });

  const risk = open.filter((i) => i.kind === "stockout" || i.kind === "overdue_po").reduce((n, i) => n + i.impact, 0);
  const stuck = open.filter((i) => i.kind === "slow_stock").reduce((n, i) => n + Number(i.facts.cash), 0);

  const steps: { name: Key; what: Key; n: number }[] = [
    { name: "step.observe", what: "step.observe.d", n: s.salesRows + s.stockLines + s.supplierLines + data.purchase_orders.length + data.products.length },
    { name: "step.reason", what: "step.reason.d", n: analysis.issues.length },
    { name: "step.evaluate", what: "step.evaluate.d", n: s.optionsCompared },
    { name: "step.decide", what: "step.decide.d", n: s.drafts },
    { name: "step.act", what: "step.act.d", n: open.filter((i) => i.recommended).length },
    { name: "step.explain", what: "step.explain.d", n: open.length },
  ];

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const listen = () => {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const lines = [T(greetingKey(p.checkedAt), { name: firstName(user.name) }), headline];
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

  const kpis: { key: Key; sub: Key; value: number; fmt: (n: number) => string; tone: string; icon: typeof Banknote }[] = [
    { key: "total.risk", sub: "kpi.risk.sub", value: risk, fmt: money, tone: "t-red", icon: Banknote },
    { key: "total.stuck", sub: "kpi.stuck.sub", value: stuck, fmt: money, tone: "t-blue", icon: Hourglass },
    { key: "total.waiting", sub: "kpi.waiting.sub", value: open.length, fmt: num, tone: "t-brass", icon: ClipboardList },
    { key: "total.done", sub: "kpi.done.sub", value: p.doneCount, fmt: num, tone: "t-green", icon: CalendarCheck2 },
  ];

  return (
    <>
      <motion.header className="hero" initial="hidden" animate="show">
        <motion.div className="hero-meta" variants={rise} custom={0}>
          <span className="eyebrow">{formatLongDate(analysis.asOf, localeOf(lang))}</span>
          <span className="chip">
            <span className="live" aria-hidden="true" />
            {time && T("nav.status", { time })}
          </span>
          {user.role === "store" && user.store && (
            <div className="seg" role="group" aria-label={T("scope.label")}>
              {[true, false].map((v) => (
                <button key={String(v)} aria-pressed={p.mine === v} onClick={() => p.onMine(v)}>
                  {p.mine === v && <motion.span layoutId="scope-today" className="seg-bg" />}
                  <span>{v ? T("scope.mine", { store: place(lang, user.store as string) }) : T("scope.all")}</span>
                </button>
              ))}
            </div>
          )}
        </motion.div>
        <motion.h1 className="greet" variants={rise} custom={1}>
          {tRich(lang, greetingKey(p.checkedAt), { name: <em>{firstName(user.name)}</em> })}
        </motion.h1>
        <motion.p className="hero-headline" variants={rise} custom={2}>
          {headline}
        </motion.p>
        <motion.p className="hero-read" variants={rise} custom={3}>
          {read}
        </motion.p>
        <motion.div className="hero-actions" variants={rise} custom={4}>
          {top[0] && (
            <button className="btn primary lg" onClick={() => p.onOpen(top[0].id)}>
              {T("brief.review")}
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          )}
          <button className="btn lg" onClick={p.onAsk}>
            <Sparkles size={17} aria-hidden="true" style={{ color: "var(--brass)" }} />
            {T("nav.ask")}
          </button>
          {hasVoice && (
            <button className="btn lg ghost" onClick={listen} aria-pressed={speaking}>
              {speaking ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
              {speaking ? T("brief.stop") : T("brief.listen")}
            </button>
          )}
        </motion.div>
      </motion.header>

      {p.requests.length > 0 && (
        <motion.div className="request-banner" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Hand size={20} aria-hidden="true" />
          <p>{p.requests.length === 1 ? T("brief.requests.one") : T("brief.requests.n", { n: p.requests.length })}</p>
          <button className="btn sm brass" onClick={() => p.onOpen(p.requests[0].issueId)}>
            {T("brief.reviewRequest")}
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        </motion.div>
      )}

      <section className="kpis" aria-label={T("nav.today")}>
        {kpis.map((k, i) => {
          const Icon = k.icon;
          return (
            <motion.div key={k.key} className={`card kpi ${k.tone}`} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.06, duration: 0.5 }}>
              <div className="kpi-top">
                <span className="kpi-ico" aria-hidden="true">
                  <Icon />
                </span>
                {T(k.key)}
              </div>
              <div className="kpi-num">
                <CountUp value={k.value} format={k.fmt} delay={0.2 + i * 0.08} />
              </div>
              <div className="kpi-sub">{T(k.sub)}</div>
            </motion.div>
          );
        })}
      </section>

      {open.length === 0 && <AgentLoop key={p.run} lang={lang} steps={steps} onRecheck={p.onRecheck} />}

      {open.length === 0 ? (
        <section className="card clear-state">
          <span className="big-check">
            <Check size={30} aria-hidden="true" />
          </span>
          <h3>{T("today.clear")}</h3>
          <p>{T("brief.none")}</p>
          <button className="btn" onClick={p.onRecheck}>
            <RefreshCw size={15} aria-hidden="true" />
            {T("brief.recheck")}
          </button>
        </section>
      ) : (
        <>
          <div className="today-grid">
            <section aria-labelledby="first-title">
              <div className="section-head">
                <h2 className="section-title" id="first-title">
                  {T("list.first")}
                  <span className="count-pill">{top.length}</span>
                </h2>
                <button className="link" onClick={p.onAll}>
                  {T("today.all", { n: open.length })}
                  <ChevronRight size={15} aria-hidden="true" />
                </button>
              </div>
              <ol className="pcards">
                {top.map((issue, i) => {
                  const rec = issue.options.find((o) => o.id === issue.recommended);
                  const fig = issueFigure(lang, issue);
                  return (
                    <motion.li key={issue.id} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.08, duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}>
                      <button className={`pcard ${kindClass(issue)}`} onClick={() => p.onOpen(issue.id)}>
                        <span className="pcard-rank" aria-hidden="true">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="pcard-body">
                          <span className="pcard-meta">
                            <KindBadge lang={lang} issue={issue} />
                            <Loc lang={lang} name={issue.location} />
                            <Urgency lang={lang} issue={issue} />
                          </span>
                          <span className="pcard-title">{issueTitle(lang, issue, data)}</span>
                          <span className="pcard-why">{issueWhy(lang, issue)}</span>
                          {rec && (
                            <span className="rec">
                              <Sparkles aria-hidden="true" />
                              <span>{optionLabel(lang, rec, issue)}</span>
                            </span>
                          )}
                        </span>
                        {fig && (
                          <span className="pcard-fig">
                            <small>{fig.label}</small>
                            <span className={`fig ${fig.tone}`}>{fig.value}</span>
                          </span>
                        )}
                        <ArrowUpRight className="pcard-go" size={18} aria-hidden="true" />
                      </button>
                    </motion.li>
                  );
                })}
              </ol>
            </section>

            <motion.section className="card netcard" aria-labelledby="net-title" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.5 }}>
              <div className="card-head">
                <div>
                  <h2 className="card-title" id="net-title">
                    {T("today.network")}
                  </h2>
                  <p className="card-sub">{T("today.network.sub")}</p>
                </div>
              </div>
              <NetworkMap lang={lang} issues={open} data={data} onPick={p.onPickLocation} title={T("today.network")} />
              <div className="net-legend">
                <span className="n-critical">
                  <i />
                  {T("map.critical")}
                </span>
                <span className="n-watch">
                  <i />
                  {T("map.watch")}
                </span>
                <span className="n-ok">
                  <i />
                  {T("map.ok")}
                </span>
                <span>
                  <i className="line" />
                  {T("map.move")}
                </span>
              </div>
            </motion.section>
          </div>

          <AgentLoop key={p.run} lang={lang} steps={steps} onRecheck={p.onRecheck} />

          {rest.length > 0 && (
            <section aria-labelledby="rest-title">
              <div className="section-head">
                <h2 className="section-title" id="rest-title">
                  {T("list.rest")}
                  <span className="count-pill">{open.length - 3}</span>
                </h2>
              </div>
              <div className="card">
                <div className="rows">
                  {rest.map((issue) => {
                    const rec = issue.options.find((o) => o.id === issue.recommended);
                    const fig = issueFigure(lang, issue);
                    return (
                      <button key={issue.id} className={`row-link ${kindClass(issue)}`} onClick={() => p.onOpen(issue.id)}>
                        <KindBadge lang={lang} issue={issue} />
                        <span style={{ minWidth: 0 }}>
                          <span className="row-title" style={{ display: "block" }}>
                            {issueTitle(lang, issue, data)}
                          </span>
                          {rec && (
                            <span className="row-rec" style={{ display: "block" }}>
                              {T("pick.label")}: {optionLabel(lang, rec, issue)}
                            </span>
                          )}
                        </span>
                        <span className="row-fig">{fig?.value ?? ""}</span>
                        <ChevronRight size={18} aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
                {open.length > 8 && (
                  <div className="card-foot">
                    <button className="link" onClick={p.onAll}>
                      {T("today.all", { n: open.length })}
                      <ChevronRight size={15} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
