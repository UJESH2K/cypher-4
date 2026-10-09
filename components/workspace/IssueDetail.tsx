"use client";

import { ArrowLeft, ArrowRight, Check, ChevronDown, Copy, CornerDownRight, FileText, Hand, Lock, MessageCircle, Send, ShieldCheck, Sparkles, Truck, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { issueFigure, KindBadge, Loc, Urgency } from "@/components/ui";
import { approvalRight, type SessionUser } from "@/lib/auth/roles";
import { formatDate } from "@/lib/dates";
import { type Key, type Lang, langName, LANGS, localeOf, money, num, place, t } from "@/lib/i18n";
import { actionDone, actionMessage, actionTitleKey, issueTitle, issueWhy, noteText, optionLabel, partName, pickReason, recipient } from "@/lib/present";
import type { ActionDraft, ApprovalRequest, Dataset, Issue, Option } from "@/lib/types";
import type { Handled } from "./types";

type Props = {
  lang: Lang;
  user: SessionUser;
  data: Dataset;
  issue: Issue;
  rejected: string[];
  approved?: Handled;
  request?: ApprovalRequest;
  hasNext: boolean;
  /** Move focus to the title on open; used on phones, where the detail replaces the list. */
  autoFocus?: boolean;
  onApprove?: (o: Option) => void;
  onReject?: (o: Option, reason: Key) => void;
  onRequest?: (o: Option) => void;
  onBack: () => void;
  onNext: () => void;
};

const LETTERS = "ABCDEFGH";
const REASONS: Key[] = ["reject.cost", "reject.supplier", "reject.stock", "reject.other"];
const SHORT: Record<Lang, string> = { en: "EN", hi: "हि", kn: "ಕ", ta: "த", te: "తె" };
const EASE = [0.2, 0.8, 0.2, 1] as const;

const COSTS: { key: Key; cls: string; of: (o: Option) => number }[] = [
  { key: "col.lost", cls: "c-lost", of: (o) => o.lostMargin },
  { key: "cost.freight", cls: "c-freight", of: (o) => o.freight },
  { key: "cost.premium", cls: "c-premium", of: (o) => o.premium },
  { key: "cost.holding", cls: "c-holding", of: (o) => o.holdingCost },
  { key: "cost.writeoff", cls: "c-writeoff", of: (o) => o.writeOff },
];

export default function IssueDetail(p: Props) {
  const { lang, user, data, issue, rejected, approved, request } = p;
  const T = (k: Key, v?: Record<string, string | number>) => t(lang, k, v);
  const dur = (n: number) => t(lang, n === 1 ? "unit.day.one" : "unit.day.other", { n: num(n) });

  const usable = (id?: string) => Boolean(id && issue.options.some((o) => o.id === id) && !rejected.includes(id));
  const initial = approved?.option.id ?? (user.role === "purchasing" && usable(request?.optionId) ? request?.optionId : undefined) ?? issue.recommended;
  const [chosenId, setChosenId] = useState(initial);
  const [asking, setAsking] = useState(false);
  const [notes, setNotes] = useState<Record<string, boolean>>({});
  const top = useRef<HTMLElement>(null);

  useEffect(() => {
    // Only when the detail first opens; later re-renders must not steal focus.
    if (p.autoFocus) top.current?.focus({ preventScroll: true });
  }, []);

  const chosen = issue.options.find((o) => o.id === chosenId && !rejected.includes(o.id)) ?? issue.options.find((o) => o.id === issue.recommended);
  const chosenIndex = chosen ? issue.options.indexOf(chosen) : -1;
  const shortage = issue.kind === "stockout" || issue.kind === "overdue_po";
  const showArrive = issue.options.some((o) => o.arrivesInDays !== null);
  const showLost = shortage || issue.options.some((o) => o.lostMargin > 0);
  const maxTotal = Math.max(1, ...issue.options.filter((o) => !rejected.includes(o.id)).map((o) => o.totalImpact));
  const right = chosen ? approvalRight(user, issue, chosen) : "none";
  const fig = issueFigure(lang, issue);
  const requestedByMe = request && request.by === user.id;
  const requestLetter = request ? LETTERS[issue.options.findIndex((o) => o.id === request.optionId)] ?? "" : "";
  const signer = approved?.by ?? user.name;

  return (
    <motion.article
      className="detail"
      aria-labelledby="detail-title"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
    >
      <div className="detail-in">
        <button className="btn ghost sm detail-back" onClick={p.onBack}>
          <ArrowLeft size={16} aria-hidden="true" />
          {T("list.back")}
        </button>

        <header ref={top} tabIndex={-1} style={{ outline: "none" }}>
          <div className="detail-meta">
            <KindBadge lang={lang} issue={issue} />
            <Loc lang={lang} name={issue.location} />
            <Urgency lang={lang} issue={issue} />
            {issue.po && <span className="chip mono">{issue.po}</span>}
            {fig && (
              <span className={`chip ${fig.tone}`}>
                {fig.label}: {fig.value}
              </span>
            )}
          </div>
          <h2 className="detail-title" id="detail-title">
            {issueTitle(lang, issue, data)}
          </h2>
          <p className="detail-why">{issueWhy(lang, issue)}</p>
          {issue.causes.length > 0 && (
            <ul className="causes">
              {issue.causes.map((c, i) => (
                <li key={i}>
                  <CornerDownRight size={15} aria-hidden="true" />
                  {noteText(lang, c)}
                </li>
              ))}
            </ul>
          )}
          {approved ? (
            <p className="banner green" role="status">
              <Check size={18} aria-hidden="true" />
              {T("done.approved")}
              {approved.by ? ` · ${T("log.by", { name: approved.by })}` : ""}
            </p>
          ) : request && !requestedByMe && user.role === "purchasing" ? (
            <p className="banner brass">
              <Hand size={18} aria-hidden="true" />
              {T("detail.requestedBy", { name: request.byName, letter: requestLetter })}
            </p>
          ) : request && requestedByMe ? (
            <p className="banner blue">
              <Send size={17} aria-hidden="true" />
              {T("detail.requested")}
            </p>
          ) : null}
        </header>

        <section className="dsec" aria-labelledby="ev-title">
          <h3 className="dsec-title" id="ev-title">
            {T("ev.title")}
          </h3>
          <Evidence lang={lang} issue={issue} dur={dur} />
          <Spark lang={lang} series={issue.series} />
        </section>

        {shortage && Number(issue.facts.cover) >= 0 && Number(issue.facts.rate) > 0 && (
          <section className="dsec" aria-labelledby="tl-title">
            <h3 className="dsec-title" id="tl-title">
              {T("ruler.title")}
            </h3>
            <ShelfTimeline lang={lang} issue={issue} pick={chosen?.id ?? issue.recommended} dur={dur} />
          </section>
        )}

        <section className="dsec" aria-labelledby="opt-title">
          <h3 className="dsec-title" id="opt-title">
            {T("options.title")}
            <span className="count-pill">{issue.options.length}</span>
          </h3>
          <div className="legend" style={{ marginBottom: 14 }} aria-label={T("detail.compare")}>
            {COSTS.filter((c) => issue.options.some((o) => c.of(o) > 0)).map((c) => (
              <span key={c.key}>
                <i className={c.cls} />
                {T(c.key)}
              </span>
            ))}
          </div>
          <div className="opts" role="radiogroup" aria-labelledby="opt-title">
            {issue.options.map((o, i) => {
              const isPick = o.id === issue.recommended && !approved;
              const isRejected = rejected.includes(o.id);
              const isChosen = chosen?.id === o.id;
              const locked = Boolean(approved) || isRejected;
              const extra = o.freight + o.premium + o.holdingCost + o.writeOff;
              const open = notes[o.id] ?? false;
              const letter = LETTERS[i] ?? String(i + 1);
              return (
                <motion.div
                  key={o.id}
                  className={`opt${isPick ? " is-pick" : ""}${isRejected ? " is-rejected" : ""}${locked ? " is-locked" : ""}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: isRejected ? 0.55 : 1, y: 0 }}
                  transition={{ delay: 0.05 + i * 0.05, duration: 0.4, ease: EASE }}
                  onClick={() => {
                    if (!locked) {
                      setChosenId(o.id);
                      setAsking(false);
                    }
                  }}
                >
                  {isChosen && !isRejected && <motion.span layoutId={`opt-ring-${issue.id}`} className="opt-ring" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
                  <div className="opt-head">
                    <span className={`letter${isChosen ? " chosen" : isPick ? " pick" : ""}`} aria-hidden="true">
                      {letter}
                    </span>
                    <div className="opt-name">{optionLabel(lang, o, issue)}</div>
                    <div className="opt-tags">
                      {isPick && (
                        <span className="chip brass">
                          <Sparkles aria-hidden="true" />
                          {T("pick.label")}
                        </span>
                      )}
                      {approved?.option.id === o.id && (
                        <span className="chip green">
                          <Check aria-hidden="true" />
                          {T("done.approved")}
                        </span>
                      )}
                      {request?.optionId === o.id && !approved && (
                        <span className="chip brass">
                          <Hand aria-hidden="true" />
                          {T("done.requested")}
                        </span>
                      )}
                      {isRejected && (
                        <span className="chip red">
                          <X aria-hidden="true" />
                          {T("pick.rejected")}
                        </span>
                      )}
                    </div>
                  </div>

                  <dl className="opt-metrics">
                    {showArrive && (
                      <div>
                        <dt>{T("col.arrives")}</dt>
                        <dd>{o.arrivesInDays === null ? "–" : o.arrivesInDays === 0 ? T("ruler.today") : dur(o.arrivesInDays)}</dd>
                      </div>
                    )}
                    {showLost && (
                      <>
                        <div>
                          <dt>{T("col.empty")}</dt>
                          <dd className={o.stockoutDays > 0 ? "bad" : ""}>{o.stockoutDays > 0 ? dur(o.stockoutDays) : T("val.none")}</dd>
                        </div>
                        <div>
                          <dt>{T("col.lost")}</dt>
                          <dd className={o.lostMargin > 0 ? "bad" : ""}>{o.lostMargin > 0 ? money(o.lostMargin) : T("val.none")}</dd>
                        </div>
                      </>
                    )}
                    <div>
                      <dt>{T("col.extra")}</dt>
                      <dd>{extra > 0 ? money(extra) : T("val.none")}</dd>
                    </div>
                    <div className="total">
                      <dt>{T("col.total")}</dt>
                      <dd>
                        {money(o.totalImpact)}
                        {o.cashOut > 0 && (
                          <small>
                            {T("col.cash")} {money(o.cashOut)}
                          </small>
                        )}
                      </dd>
                    </div>
                  </dl>

                  <div className="costbar" role="img" aria-label={`${T("col.total")}: ${money(o.totalImpact)}`}>
                    {COSTS.map((c) => {
                      const v = c.of(o);
                      if (v <= 0) return null;
                      return (
                        <motion.span
                          key={c.key}
                          className={c.cls}
                          initial={{ width: 0 }}
                          animate={{ width: `${(v / maxTotal) * 100}%` }}
                          transition={{ delay: 0.25 + i * 0.06, duration: 0.8, ease: EASE }}
                        />
                      );
                    })}
                  </div>

                  <div className="opt-foot">
                    <button
                      className="opt-toggle"
                      aria-expanded={open}
                      aria-controls={`notes-${o.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setNotes((n) => ({ ...n, [o.id]: !open }));
                      }}
                    >
                      {T(open ? "detail.working.hide" : "detail.working.show")}
                      <ChevronDown size={15} aria-hidden="true" />
                    </button>
                    {!locked && (
                      <button
                        className={`btn sm${isChosen ? " ink" : ""}`}
                        role="radio"
                        aria-checked={isChosen}
                        onClick={(e) => {
                          e.stopPropagation();
                          setChosenId(o.id);
                          setAsking(false);
                        }}
                      >
                        {isChosen ? <Check size={15} aria-hidden="true" /> : null}
                        {isChosen ? T("pick.yours") : T("options.choose")}
                      </button>
                    )}
                  </div>

                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.ul
                        id={`notes-${o.id}`}
                        className="opt-notes"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: EASE }}
                        style={{ overflow: "hidden" }}
                      >
                        {o.notes.map((n, j) => (
                          <li key={j}>{noteText(lang, n)}</li>
                        ))}
                      </motion.ul>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
          {!approved && (
            <p className="why-pick">
              <Sparkles size={17} aria-hidden="true" />
              <span>
                <b>{T("pick.label")}: </b>
                {pickReason(lang, issue, rejected)}
              </span>
            </p>
          )}
        </section>

        {chosen && (
          <section className="dsec" aria-labelledby="draft-title">
            <h3 className="dsec-title" id="draft-title">
              {T("draft.title")}
            </h3>
            {chosen.actions.length === 0 && <p className="muted">{T("draft.none")}</p>}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={chosen.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
                {chosen.actions.map((a, i) => (
                  <Slip key={`${chosen.id}-${i}`} lang={lang} data={data} action={a} sendable={Boolean(approved)} signer={signer} />
                ))}
              </motion.div>
            </AnimatePresence>
          </section>
        )}
      </div>

      <div className="decide">
        {approved ? (
          <div className="done-state" role="status">
            <motion.span className="done-check" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 420, damping: 18 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <motion.path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.15, duration: 0.45 }} />
              </svg>
            </motion.span>
            <span className="done-text">
              <b>{approved.option.actions.length ? approved.option.actions.map((a) => actionDone(lang, a)).join(" ") : optionLabel(lang, approved.option, issue)}</b>
              <span>{T("done.simulated")}</span>
            </span>
            {p.hasNext && (
              <button className="btn primary" onClick={p.onNext}>
                {T("detail.next")}
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        ) : !chosen ? (
          <p className="muted">{T("pick.none")}</p>
        ) : (
          <>
            <div className="decide-row">
              <div className="decide-what">
                <b>
                  {T("detail.option", { letter: LETTERS[chosenIndex] ?? "" })} · {optionLabel(lang, chosen, issue)}
                </b>
                <span>
                  {T("col.total")} {money(chosen.totalImpact)}
                  {chosen.cashOut > 0 ? ` · ${T("col.cash")} ${money(chosen.cashOut)}` : ""}
                </span>
              </div>
              <div className="decide-btns">
                {right === "approve" && (
                  <>
                    <button className="btn danger" onClick={() => setAsking((a) => !a)} aria-expanded={asking} aria-haspopup="menu">
                      <X size={16} aria-hidden="true" />
                      {T("btn.reject")}
                    </button>
                    <button className="btn primary" onClick={() => p.onApprove?.(chosen)}>
                      <Check size={17} aria-hidden="true" />
                      {T("detail.approve", { letter: LETTERS[chosenIndex] ?? "" })}
                    </button>
                  </>
                )}
                {right === "request" && (
                  <button className="btn brass" disabled={request?.optionId === chosen.id} onClick={() => p.onRequest?.(chosen)}>
                    {request?.optionId === chosen.id ? <Check size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
                    {request?.optionId === chosen.id ? T("done.requested") : T("detail.request")}
                  </button>
                )}
                <AnimatePresence>
                  {asking && (
                    <motion.div
                      className="reasons"
                      role="menu"
                      aria-label={T("reject.title")}
                      initial={{ opacity: 0, y: 8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.98 }}
                      transition={{ duration: 0.16 }}
                      style={{ transformOrigin: "bottom right" }}
                    >
                      <p>{T("reject.title")}</p>
                      {REASONS.map((r) => (
                        <button
                          key={r}
                          className="pop-item"
                          role="menuitem"
                          onClick={() => {
                            setAsking(false);
                            p.onReject?.(chosen, r);
                          }}
                        >
                          {T(r)}
                        </button>
                      ))}
                      <button className="pop-item" role="menuitem" style={{ color: "var(--muted)" }} onClick={() => setAsking(false)}>
                        {T("reject.cancel")}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <p className="decide-note">
              {right === "approve" ? <ShieldCheck size={15} aria-hidden="true" /> : <Lock size={15} aria-hidden="true" />}
              {right === "approve" ? T("approve.note") : right === "request" ? T("detail.locked.store") : T("detail.locked.viewer")}
            </p>
          </>
        )}
      </div>
    </motion.article>
  );
}

function Evidence({ lang, issue, dur }: { lang: Lang; issue: Issue; dur: (n: number) => string }) {
  const f = issue.facts;
  const n = (k: string) => Number(f[k]);
  const units = (v: number) => t(lang, "unit.units", { n: num(v) });
  let tiles: [Key, string][] = [];
  switch (issue.kind) {
    case "stockout":
      tiles = [
        ["ev.stock", units(n("stock"))],
        ["ev.rate", num(n("rate"))],
        ["ev.cover", dur(n("cover"))],
        ["ev.lead", n("usualLead") >= 0 ? dur(n("usualLead")) : "–"],
      ];
      break;
    case "overdue_po":
      tiles = [
        ["ev.late", dur(n("daysLate"))],
        ["ev.orderqty", units(n("qty"))],
        ["ev.stock", units(n("stock"))],
        ["ev.cover", n("cover") >= 0 ? dur(n("cover")) : "–"],
      ];
      break;
    case "slow_stock":
      tiles = [
        ["ev.stock", units(n("stock"))],
        ["ev.rate", num(n("rate"))],
        ["ev.cover", n("cover") >= 0 ? dur(n("cover")) : "–"],
        ["ev.cash", money(n("cash"))],
      ];
      break;
    case "supplier_fit":
      tiles = [
        ["ev.orderqty", units(n("qty"))],
        ["ev.rate", num(n("rate"))],
        ["ev.cover", dur(n("days"))],
        ["ev.cash", money(n("cash"))],
      ];
      break;
    case "demand_spike":
      tiles = [
        ["ev.before", num(n("from"))],
        ["ev.now", num(n("to"))],
        ["ev.stock", units(n("stock"))],
        ["ev.cover", dur(n("cover"))],
      ];
      break;
    case "demand_drop":
      tiles = [
        ["ev.before", num(n("from"))],
        ["ev.now", num(n("to"))],
        ["ev.stock", units(n("stock"))],
        ["ev.onorder", units(n("incoming"))],
      ];
      break;
  }
  return (
    <dl className="tiles">
      {tiles.map(([k, v], i) => (
        <motion.div key={k} className="tile" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + i * 0.04, duration: 0.35 }}>
          <dt>{t(lang, k)}</dt>
          <dd>{v}</dd>
        </motion.div>
      ))}
    </dl>
  );
}

/** 28 days of sales. The last seven are highlighted, since that is where a jump or drop shows. */
function Spark({ lang, series }: { lang: Lang; series: number[] }) {
  const gid = useId().replace(/:/g, "");
  const max = Math.max(...series, 0);
  if (max <= 0 || series.length < 8) return null;
  const W = 560;
  const H = 86;
  const n = series.length;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => H - 4 - (v / max) * (H - 12);
  const pts = series.map((v, i) => [x(i), y(v)] as const);
  const line = (arr: readonly (readonly [number, number])[]) => arr.map(([a, b], i) => `${i ? "L" : "M"}${a.toFixed(1)},${b.toFixed(1)}`).join(" ");
  const split = n - 7;
  const total = series.reduce((a, b) => a + b, 0);
  const recent = series.slice(-7).reduce((a, b) => a + b, 0);
  return (
    <figure className="spark">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${t(lang, "ev.sales28")}: ${num(total)}. ${t(lang, "ev.now")}: ${num(recent)}`}>
        <defs>
          <linearGradient id={`sg${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.22" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x={x(split)} y={0} width={W - x(split)} height={H} rx={8} fill="var(--accent-soft)" opacity={0.55} />
        <motion.path d={`${line(pts)} L${W},${H} L0,${H} Z`} fill={`url(#sg${gid})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4, duration: 0.6 }} />
        <motion.path d={line(pts.slice(0, split + 1))} fill="none" stroke="var(--faint)" strokeWidth={2} strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: "easeOut" }} />
        <motion.path d={line(pts.slice(split))} fill="none" stroke="var(--accent)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.8, duration: 0.5, ease: "easeOut" }} />
        <motion.circle cx={pts[n - 1][0]} cy={pts[n - 1][1]} r={4.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.25, type: "spring", stiffness: 400, damping: 15 }} />
      </svg>
      <figcaption className="spark-cap">
        <span>{t(lang, "ev.sales28")}</span>
        <span>
          {t(lang, "ev.now")}: <b>{num(recent)}</b>
        </span>
      </figcaption>
    </figure>
  );
}

/** When the shelf empties (dashed line) against when each option's stock lands (dot). */
function ShelfTimeline({ lang, issue, pick, dur }: { lang: Lang; issue: Issue; pick: string; dur: (n: number) => string }) {
  const cover = Number(issue.facts.cover);
  const arrivals = issue.options.map((o) => o.arrivesInDays ?? 0);
  const span = Math.min(21, Math.max(Math.ceil(cover) + 2, ...arrivals.map((a) => a + 1), 6));
  const pct = (d: number) => Math.min(100, Math.max(0, (d / span) * 100));
  const step = span > 12 ? 4 : 2;
  const ticks: number[] = [];
  for (let d = 0; d <= span - step / 2; d += step) ticks.push(d);
  // The flag sits above the dashed line; near either edge it hangs inwards so it never leaves the track.
  const flagShift = pct(cover) < 12 ? "0" : pct(cover) > 85 ? "-100%" : "-50%";
  return (
    <div>
      <div className="tl">
        {issue.options.map((o, i) => {
          const a = o.arrivesInDays;
          const end = a === null ? span : a;
          const okTo = Math.min(end, cover);
          return (
            <div className="tl-row" key={o.id}>
              <span className={`letter${o.id === pick ? " chosen" : ""}`}>{LETTERS[i] ?? i + 1}</span>
              <div className="tl-track" role="img" aria-label={`${optionLabel(lang, o, issue)}: ${a === null ? "–" : dur(a)}; ${t(lang, "col.empty")}: ${o.stockoutDays > 0 ? dur(o.stockoutDays) : t(lang, "val.none")}`}>
                <motion.span className="tl-ok" initial={{ width: 0 }} animate={{ width: `${pct(okTo)}%` }} transition={{ delay: 0.1 + i * 0.07, duration: 0.7, ease: EASE }} />
                {end > cover && o.stockoutDays > 0 && (
                  <motion.span
                    className="tl-gap"
                    style={{ left: `${pct(cover)}%` }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct(end) - pct(cover)}%` }}
                    transition={{ delay: 0.5 + i * 0.07, duration: 0.5, ease: EASE }}
                  />
                )}
                {a !== null && (
                  <motion.span className="tl-dot" style={{ left: `${pct(a)}%` }} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.7 + i * 0.07, type: "spring", stiffness: 420, damping: 16 }} />
                )}
              </div>
            </div>
          );
        })}
        <div className="tl-overlay" aria-hidden="true">
          <span className="tl-flag" style={{ left: `${pct(cover)}%`, transform: `translateX(${flagShift})` }}>
            {t(lang, "ruler.empty")}
          </span>
          <span className="tl-line" style={{ left: `${pct(cover)}%` }} />
        </div>
        <div className="tl-axis" aria-hidden="true">
          {ticks.map((d) => (
            <span key={d} style={{ left: `${pct(d)}%` }}>
              {d === 0 ? t(lang, "ruler.today") : t(lang, "ruler.day", { n: d })}
            </span>
          ))}
        </div>
      </div>
      <p className="legend">
        <span>
          <i style={{ background: "color-mix(in srgb, var(--accent) 45%, transparent)" }} />
          {t(lang, "ev.stock")}
        </span>
        <span>
          <i style={{ background: "var(--red)" }} />
          {t(lang, "ruler.empty")}
        </span>
        <span>
          <i style={{ background: "var(--ink)", width: 10, height: 10, borderRadius: "50%" }} />
          {t(lang, "col.arrives")}
        </span>
      </p>
    </div>
  );
}

function Slip({ lang, data, action, sendable, signer }: { lang: Lang; data: Dataset; action: ActionDraft; sendable: boolean; signer: string }) {
  const T = (k: Key, v?: Record<string, string | number>) => t(lang, k, v);
  const to = recipient(action);
  const [msgLang, setMsgLang] = useState<Lang>(to.lang);
  const [copied, setCopied] = useState(false);
  const message = actionMessage(msgLang, action, data, signer);
  const part = `${partName(data, action.sku)} (${action.sku})`;
  const locale = localeOf(lang);
  const id = action.type === "po" ? action.po : action.type === "transfer" ? action.id : action.type === "enquiry" ? action.po : "";
  const who = to.isSupplier ? to.name : t(lang, "m.team", { loc: place(lang, to.name) });
  const Icon = action.type === "transfer" ? Truck : action.type === "po" ? FileText : MessageCircle;

  let fields: [Key, string][] = [];
  if (action.type === "po")
    fields = [
      ["f.supplier", action.supplier],
      ["f.part", part],
      ["f.qty", num(action.qty)],
      ["f.price", money(action.price)],
      ["f.total", money(action.total)],
      ["f.deliver", place(lang, action.location)],
      ["f.expected", `${formatDate(action.expected_date, locale)} (${t(lang, action.leadDays === 1 ? "unit.day.one" : "unit.day.other", { n: action.leadDays })})`],
    ];
  else if (action.type === "transfer")
    fields = [
      ["f.from", place(lang, action.from)],
      ["f.to", place(lang, action.to)],
      ["f.part", part],
      ["f.qty", num(action.qty)],
      ["f.expected", formatDate(action.eta, locale)],
      ["f.distance", T("f.km", { n: action.km })],
      ["f.transport", money(action.freight)],
    ];
  else if (action.type === "enquiry")
    fields = [
      ["f.supplier", action.supplier],
      ["f.part", part],
      ["f.qty", num(action.qty)],
    ];
  else
    fields = [
      ["f.to", place(lang, action.location)],
      ["f.part", part],
    ];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="slip">
      <div className="slip-head">
        <span className="slip-type">
          <Icon size={18} aria-hidden="true" />
          {T(actionTitleKey(action))}
        </span>
        {id && <span className="slip-id">{id}</span>}
      </div>
      <dl className="fields">
        {fields.map(([k, v]) => (
          <div key={k}>
            <dt>{T(k)}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="msg">
        <div className="msg-bar">
          <span className="lbl" id={`ml-${id || action.sku}`}>
            {T("msg.lang")}
          </span>
          <div className="langs" role="group" aria-labelledby={`ml-${id || action.sku}`}>
            {LANGS.map((l) => (
              <button key={l.code} aria-pressed={msgLang === l.code} aria-label={l.name} lang={l.code} onClick={() => setMsgLang(l.code)}>
                {msgLang === l.code && <motion.span layoutId={`ml-bg-${id || action.sku}`} className="seg-bg" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                <span>{SHORT[l.code]}</span>
              </button>
            ))}
          </div>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p key={msgLang} className="bubble-msg" lang={msgLang} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
            {message}
          </motion.p>
        </AnimatePresence>
        {msgLang === to.lang && <p className="msg-why">{T("msg.why", { lang: langName(to.lang), who })}</p>}
        {sendable && (
          <div className="msg-actions">
            <button className="btn sm" onClick={copy}>
              {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
              {copied ? T("msg.copied") : T("msg.copy")}
            </button>
            <a className="btn sm" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
              <MessageCircle size={15} aria-hidden="true" />
              {T("msg.whatsapp")}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
