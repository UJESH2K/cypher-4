"use client";

import { type Key, type Lang, localeOf, money, place, t } from "@/lib/i18n";
import { actionDone, optionLabel, partName } from "@/lib/present";
import type { Dataset, Issue, LogEntry } from "@/lib/types";

type Props = { lang: Lang; data: Dataset; log: LogEntry[]; onClear: () => void };

export default function LogView({ lang, data, log, onClear }: Props) {
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
        <h1>{T("log.title")}</h1>
        <p>{T("log.sub")}</p>
      </div>
      {log.length === 0 ? (
        <p className="empty">{T("log.empty")}</p>
      ) : (
        <>
          <ul className="log">
            {log.map((e) => {
              // optionLabel only needs the location to tell "move in" from "move out".
              const stub = { location: e.location } as Issue;
              return (
                <li key={e.id}>
                  <div className="log-top">
                    <span className={`tag ${e.decision === "approved" ? "green" : "red"}`}>{T(e.decision === "approved" ? "done.approved" : "done.rejected")}</span>
                    <span>{time(e.at)}</span>
                    <span>{T(`kind.${e.kind}` as Key)}</span>
                    <span>
                      {partName(data, e.sku)}, {place(lang, e.location)}
                    </span>
                  </div>
                  <p className="log-what">{optionLabel(lang, e.option, stub)}</p>
                  <p className="log-more">
                    {e.decision === "approved"
                      ? [...e.option.actions.map((a) => actionDone(lang, a)), T("log.total", { x: money(e.option.totalImpact) })].join(" ")
                      : T("log.reason", { why: e.reason ? T(e.reason as Key) : "" })}
                  </p>
                </li>
              );
            })}
          </ul>
          <p style={{ marginTop: 16 }}>
            <button className="btn" onClick={onClear}>
              {T("log.clear")}
            </button>
          </p>
        </>
      )}
    </>
  );
}
