"use client";

import { Check, Hand, History, Trash2, X } from "lucide-react";
import { motion } from "motion/react";
import { KindBadge } from "@/components/ui";
import { type Key, type Lang, localeOf, money, place, t } from "@/lib/i18n";
import { actionDone, optionLabel, partName } from "@/lib/present";
import type { Dataset, Issue, LogEntry } from "@/lib/types";

type Props = { lang: Lang; data: Dataset; log: LogEntry[]; onClear: () => void; onOpen: (issueId: string) => void };

const PIN = { approved: Check, rejected: X, requested: Hand };
const LABEL: Record<LogEntry["decision"], Key> = { approved: "done.approved", rejected: "done.rejected", requested: "done.requested" };
const CHIP: Record<LogEntry["decision"], string> = { approved: "green", rejected: "red", requested: "brass" };

export default function DecisionsView({ lang, data, log, onClear, onOpen }: Props) {
  const T = (k: Key, v?: Record<string, string | number>) => t(lang, k, v);
  const time = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(localeOf(lang), { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
    } catch {
      return iso.slice(11, 16);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{T("log.title")}</h1>
          <p className="page-sub">{T("log.sub")}</p>
        </div>
        {log.length > 0 && (
          <button className="btn" onClick={onClear}>
            <Trash2 size={16} aria-hidden="true" />
            {T("log.clear")}
          </button>
        )}
      </div>

      {log.length === 0 ? (
        <div className="card empty-state">
          <span className="ico">
            <History size={28} aria-hidden="true" />
          </span>
          <h3>{T("log.title")}</h3>
          <p>{T("log.empty")}</p>
        </div>
      ) : (
        <ol className="timeline">
          {log.map((e, i) => {
            // optionLabel only needs the location to tell "move in" from "move out".
            const stub = { location: e.location, kind: e.kind, facts: {} } as unknown as Issue;
            const Icon = PIN[e.decision];
            return (
              <motion.li
                key={e.id}
                className="tl-entry"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i, 10) * 0.04, duration: 0.35 }}
              >
                <span className="tl-time">{time(e.at)}</span>
                <span className={`tl-pin p-${e.decision}`} aria-hidden="true">
                  <Icon />
                </span>
                <button className="card tl-card" style={{ textAlign: "left", width: "100%" }} onClick={() => onOpen(e.issueId)}>
                  <span className="tl-top">
                    <span className={`chip ${CHIP[e.decision]}`}>{T(LABEL[e.decision])}</span>
                    <KindBadge lang={lang} issue={stub} />
                    <span>
                      {partName(data, e.sku)} · {place(lang, e.location)}
                    </span>
                    {e.by && <span className="who">{T("log.by", { name: e.by })}</span>}
                  </span>
                  <span className="tl-what" style={{ display: "block" }}>
                    {optionLabel(lang, e.option, stub)}
                  </span>
                  <span className="tl-more" style={{ display: "block" }}>
                    {e.decision === "approved"
                      ? [...e.option.actions.map((a) => actionDone(lang, a)), T("log.total", { x: money(e.option.totalImpact) })].join(" ")
                      : e.decision === "rejected"
                        ? T("log.reason", { why: e.reason ? T(e.reason as Key) : "" })
                        : T("detail.requested")}
                  </span>
                </button>
              </motion.li>
            );
          })}
        </ol>
      )}
    </>
  );
}
