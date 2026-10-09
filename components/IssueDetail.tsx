"use client";

import { useState } from "react";
import { formatDate } from "@/lib/dates";
import { isLang, type Key, type Lang, LANGS, langName, localeOf, money, num, place, t } from "@/lib/i18n";
import { actionDone, actionMessage, actionTitleKey, issueTitle, issueWhy, noteText, optionLabel, partName, pickReason, recipient } from "@/lib/present";
import type { ActionDraft, Dataset, Issue, Option } from "@/lib/types";
import type { Handled } from "./Desk";
import { KindTag } from "./IssueList";

type Props = {
  lang: Lang;
  data: Dataset;
  issue: Issue;
  rejected: string[];
  approved?: Handled;
  onApprove?: (o: Option) => void;
  onReject?: (o: Option, reason: Key) => void;
  onBack: () => void;
};

const LETTERS = "ABCDEFGH";
const REASONS: Key[] = ["reject.cost", "reject.supplier", "reject.stock", "reject.other"];

export default function IssueDetail({ lang, data, issue, rejected, approved, onApprove, onReject, onBack }: Props) {
  const T = (k: Key, v?: Record<string, string | number>) => t(lang, k, v);
  const dur = (n: number) => t(lang, n === 1 ? "unit.day.one" : "unit.day.other", { n: num(n) });
  const [chosenId, setChosenId] = useState(approved?.option.id ?? issue.recommended);
  const [asking, setAsking] = useState(false);

  const chosen = issue.options.find((o) => o.id === chosenId) ?? issue.options.find((o) => o.id === issue.recommended);
  const shortage = issue.kind === "stockout" || issue.kind === "overdue_po";
  const showArrive = issue.options.some((o) => o.arrivesInDays !== null);
  const showLost = shortage || issue.options.some((o) => o.lostMargin > 0);

  return (
    <article className="detail" aria-labelledby="detail-title">
      <header className="detail-head">
        <button className="btn small back" onClick={onBack}>
          {T("list.back")}
        </button>
        <KindTag lang={lang} issue={issue} />
        <h2 id="detail-title">{issueTitle(lang, issue, data)}</h2>
        <p className="why">{issueWhy(lang, issue)}</p>
        {issue.causes.length > 0 && (
          <ul className="causes">
            {issue.causes.map((c, i) => (
              <li key={i}>{noteText(lang, c)}</li>
            ))}
          </ul>
        )}
      </header>

      <section className="block" aria-label={T("ev.title")}>
        <h3 className="block-title">{T("ev.title")}</h3>
        <Evidence lang={lang} issue={issue} dur={dur} />
        <Spark lang={lang} series={issue.series} />
      </section>

      {shortage && Number(issue.facts.cover) >= 0 && Number(issue.facts.rate) > 0 && (
        <section className="block" aria-label={T("ruler.title")}>
          <h3 className="block-title">{T("ruler.title")}</h3>
          <Ruler lang={lang} issue={issue} pick={approved?.option.id ?? issue.recommended} dur={dur} />
        </section>
      )}

      <section className="block" aria-label={T("options.title")}>
        <h3 className="block-title">{T("options.title")}</h3>
        <div className="options">
          {issue.options.map((o, i) => {
            const isPick = o.id === issue.recommended && !approved;
            const isRejected = rejected.includes(o.id);
            const isChosen = chosen?.id === o.id;
            const extra = o.freight + o.premium + o.holdingCost + o.writeOff;
            const parts: [Key, number][] = [
              ["cost.freight", o.freight],
              ["cost.premium", o.premium],
              ["cost.holding", o.holdingCost],
              ["cost.writeoff", o.writeOff],
            ];
            return (
              <div key={o.id} className={`option${isPick ? " is-pick" : ""}${isChosen ? " is-chosen" : ""}${isRejected ? " is-rejected" : ""}`}>
                <div className="option-head">
                  <span className={`letter${isPick ? " pick" : ""}`} aria-hidden="true">
                    {LETTERS[i] ?? i + 1}
                  </span>
                  <div>
                    <div>
                      {isPick && <span className="tag">{T("pick.label")}</span>}
                      {approved?.option.id === o.id && <span className="tag green">{T("done.approved")}</span>}
                      {isRejected && <span className="tag red">{T("pick.rejected")}</span>}
                      {!approved && isChosen && !isPick && !isRejected && <span className="tag grey">{T("pick.yours")}</span>}
                    </div>
                    <div className="option-name">{optionLabel(lang, o, issue)}</div>
                    <ul className="option-notes">
                      {o.notes.map((n, j) => (
                        <li key={j}>{noteText(lang, n)}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <dl className="metrics">
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
                    <dd>
                      {extra > 0 ? money(extra) : T("val.none")}
                      {parts
                        .filter(([, v]) => v > 0)
                        .map(([k, v]) => (
                          <small key={k}>
                            {T(k)} {money(v)}
                          </small>
                        ))}
                    </dd>
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
                {!approved && !isChosen && !isRejected && (
                  <button className="btn small choose" onClick={() => { setChosenId(o.id); setAsking(false); }}>
                    {T("options.choose")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {!approved && (
          <p className="pick-why">
            <b>{T("pick.label")}: </b>
            {pickReason(lang, issue, rejected)}
          </p>
        )}
      </section>

      {chosen && (
        <section className="block" aria-label={T("draft.title")}>
          <h3 className="block-title">{T("draft.title")}</h3>
          {chosen.actions.length === 0 && <p className="issue-meta">{T("draft.none")}</p>}
          {chosen.actions.map((a, i) => (
            <Slip key={`${chosen.id}-${i}`} lang={lang} data={data} action={a} sendable={Boolean(approved)} />
          ))}
        </section>
      )}

      <section className="block">
        {approved ? (
          <div className="outcome" role="status">
            <b>{T("done.approved")}. </b>
            {approved.option.actions.length ? approved.option.actions.map((a) => actionDone(lang, a)).join(" ") : optionLabel(lang, approved.option, issue)}
            <small>{T("done.simulated")}</small>
          </div>
        ) : !chosen ? (
          <p className="issue-meta">{T("pick.none")}</p>
        ) : asking ? (
          <div className="reasons">
            <p>
              <b>{T("reject.title")}</b>
            </p>
            <div className="reasons-list">
              {REASONS.map((r) => (
                <button key={r} className="btn" onClick={() => { setAsking(false); onReject?.(chosen, r); }}>
                  {T(r)}
                </button>
              ))}
              <button className="btn" onClick={() => setAsking(false)}>
                {T("reject.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <div className="decide">
            <button className="btn primary" onClick={() => onApprove?.(chosen)}>
              {T("btn.approve")}
            </button>
            <button className="btn danger" onClick={() => setAsking(true)}>
              {T("btn.reject")}
            </button>
            <p className="decide-note">{T("approve.note")}</p>
          </div>
        )}
      </section>
    </article>
  );
}

function Evidence({ lang, issue, dur }: { lang: Lang; issue: Issue; dur: (n: number) => string }) {
  const f = issue.facts;
  const n = (k: string) => Number(f[k]);
  const T = (k: Key) => t(lang, k);
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
      {tiles.map(([k, v]) => (
        <div key={k}>
          <dt className="tile-label">{T(k)}</dt>
          <dd className="tile-num">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Spark({ lang, series }: { lang: Lang; series: number[] }) {
  const max = Math.max(...series, 0);
  if (max <= 0) return null;
  const total = series.reduce((a, b) => a + b, 0);
  const recent = series.slice(-7).reduce((a, b) => a + b, 0);
  return (
    <figure className="spark" style={{ margin: "16px 0 0" }}>
      <div className="spark-bars" role="img" aria-label={`${t(lang, "ev.sales28")}: ${num(total)}`}>
        {series.map((v, i) => (
          <span key={i} className={i >= series.length - 7 ? "recent" : ""} style={{ height: `${(v / max) * 100}%` }} />
        ))}
      </div>
      <figcaption className="spark-cap">
        <span>{t(lang, "ev.sales28")}</span>
        <span>
          <b>
            {t(lang, "ev.now")}: {num(recent)}
          </b>
        </span>
      </figcaption>
    </figure>
  );
}

/** A day ruler: the dashed red line is the day the shelf empties; each row shows when that option's stock lands. */
function Ruler({ lang, issue, pick, dur }: { lang: Lang; issue: Issue; pick: string; dur: (n: number) => string }) {
  const cover = Number(issue.facts.cover);
  const arrivals = issue.options.map((o) => o.arrivesInDays ?? 0);
  const span = Math.min(21, Math.max(Math.ceil(cover) + 2, ...arrivals.map((a) => a + 1), 6));
  const pct = (d: number) => `${Math.min(100, (d / span) * 100)}%`;
  const step = span > 12 ? 4 : 2;
  const ticks: number[] = [];
  for (let d = 0; d <= span; d += step) ticks.push(d);
  const side = cover / span > 0.8 ? " right" : cover / span < 0.12 ? " left" : "";
  return (
    <div>
      <div className="ruler-wrap">
        <div className="ruler">
          {issue.options.map((o, i) => {
            const a = o.arrivesInDays;
            const end = a === null ? span : a;
            return (
              <div className="ruler-row" key={o.id}>
                <span className={`letter${o.id === pick ? " pick" : ""}`}>{LETTERS[i] ?? i + 1}</span>
                <div className="track" role="img" aria-label={`${optionLabel(lang, o, issue)}: ${a === null ? "–" : dur(a)}; ${t(lang, "col.empty")}: ${o.stockoutDays > 0 ? dur(o.stockoutDays) : t(lang, "val.none")}`}>
                  <span className="ok" style={{ left: 0, width: pct(Math.min(end, cover)) }} />
                  {end > cover && o.stockoutDays > 0 && <span className="gap" style={{ left: pct(cover), width: `calc(${pct(end)} - ${pct(cover)})` }} />}
                  {a !== null && <span className="dot" style={{ left: pct(a) }} />}
                </div>
              </div>
            );
          })}
        </div>
        <div className="ruler-row" aria-hidden="true">
          <span />
          <div className="ruler-axis">
            {ticks.map((d) => (
              <span key={d} className="tick" style={{ left: pct(d) }}>
                {d === 0 ? t(lang, "ruler.today") : t(lang, "ruler.day", { n: d })}
              </span>
            ))}
            <span className={`empty-mark${side}`} style={{ left: pct(cover) }}>
              {t(lang, "ruler.empty")}
            </span>
          </div>
        </div>
        <div className="ruler-row" aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", alignItems: "stretch" }}>
          <span />
          <div style={{ position: "relative" }}>
            <span className="ruler-line" style={{ left: pct(cover) }} />
          </div>
        </div>
      </div>
      <p className="legend">
        <span>
          <i style={{ background: "#9fb4c6" }} />
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

function Slip({ lang, data, action, sendable }: { lang: Lang; data: Dataset; action: ActionDraft; sendable: boolean }) {
  const T = (k: Key, v?: Record<string, string | number>) => t(lang, k, v);
  const to = recipient(action);
  const [msgLang, setMsgLang] = useState<Lang>(to.lang);
  const [copied, setCopied] = useState(false);
  const message = actionMessage(msgLang, action, data);
  const part = `${partName(data, action.sku)} (${action.sku})`;
  const locale = localeOf(lang);
  const id = action.type === "po" ? action.po : action.type === "transfer" ? action.id : action.type === "enquiry" ? action.po : "";
  const who = to.isSupplier ? to.name : t(lang, "m.team", { loc: place(lang, to.name) });

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

  const selectId = `ml-${action.type}-${id || action.sku}`;
  return (
    <div className="slip">
      <div className="slip-head">
        <span>{T(actionTitleKey(action))}</span>
        <span>{id}</span>
      </div>
      <dl className="fields">
        {fields.map(([k, v]) => (
          <div key={k}>
            <dt>{T(k)}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="message">
        <div className="message-bar">
          <label htmlFor={selectId}>{T("msg.lang")}</label>
          <select id={selectId} className="select light" value={msgLang} onChange={(e) => isLang(e.target.value) && setMsgLang(e.target.value)}>
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <p className="message-text" lang={msgLang}>
          {message}
        </p>
        {msgLang === to.lang && <p className="message-why">{T("msg.why", { lang: langName(to.lang), who })}</p>}
        {sendable && (
          <div className="message-actions">
            <button className="btn small" onClick={copy}>
              {copied ? T("msg.copied") : T("msg.copy")}
            </button>
            <a className="btn small" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
              {T("msg.whatsapp")}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
