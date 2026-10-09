"use client";

import { type Key, type Lang, money, t } from "@/lib/i18n";
import { issueTitle, kindKey, optionLabel } from "@/lib/present";
import type { Dataset, Issue } from "@/lib/types";
import type { Handled } from "./Desk";

type Props = {
  lang: Lang;
  data: Dataset;
  open: Issue[];
  done: Handled[];
  activeId: string | null;
  onSelect: (id: string) => void;
};

export function KindTag({ lang, issue }: { lang: Lang; issue: Issue }) {
  const k = kindKey(issue);
  return (
    <span className={`kind ${k.replace("kind.", "")}`}>
      <i aria-hidden="true" />
      {t(lang, k)}
    </span>
  );
}

function figure(lang: Lang, issue: Issue): string {
  if (issue.kind === "slow_stock" || issue.kind === "demand_drop" || issue.kind === "supplier_fit")
    return `${t(lang, "total.stuck")}: ${money(Number(issue.facts.cash))}`;
  if (issue.kind === "demand_spike" || issue.impact <= 0) return "";
  return `${t(lang, "total.risk")}: ${money(issue.impact)}`;
}

export default function IssueList({ lang, data, open, done, activeId, onSelect }: Props) {
  const T = (k: Key) => t(lang, k);
  const first = open.slice(0, 3);
  const rest = open.slice(3);

  const card = (issue: Issue, rank: number, cls: string, picked?: string) => {
    const rec = issue.options.find((o) => o.id === (picked ?? issue.recommended));
    const fig = figure(lang, issue);
    return (
      <li key={issue.id}>
        <button className="issue-card" aria-current={activeId === issue.id ? "true" : undefined} onClick={() => onSelect(issue.id)}>
          <span className={`rank ${cls}`} aria-hidden="true">
            {cls === "done" ? "✓" : rank}
          </span>
          <KindTag lang={lang} issue={issue} />
          <span className="issue-title">{issueTitle(lang, issue, data)}</span>
          <span className="issue-meta">
            {rec ? `${t(lang, picked ? "done.approved" : "pick.label")}: ${optionLabel(lang, rec, issue)}` : T("pick.none")}
            {fig && !picked ? (
              <>
                <br />
                {fig}
              </>
            ) : null}
          </span>
        </button>
      </li>
    );
  };

  if (!open.length && !done.length) return <p className="empty">{T("list.empty")}</p>;

  return (
    <>
      {first.length > 0 && (
        <section className="list-group" aria-labelledby="g-first">
          <h2 className="section-title" id="g-first">
            {T("list.first")}
          </h2>
          <ol className="issue-list">{first.map((i, n) => card(i, n + 1, ""))}</ol>
        </section>
      )}
      {rest.length > 0 && (
        <section className="list-group" aria-labelledby="g-rest">
          <h2 className="section-title" id="g-rest">
            {T("list.rest")}
          </h2>
          <ol className="issue-list" start={4}>
            {rest.map((i, n) => card(i, n + 4, "minor"))}
          </ol>
        </section>
      )}
      {!open.length && <p className="empty">{T("list.empty")}</p>}
      {done.length > 0 && (
        <section className="list-group" aria-labelledby="g-done">
          <h2 className="section-title" id="g-done">
            {T("list.done")}
          </h2>
          <ul className="issue-list">{done.map((h) => card(h.issue, 0, "done", h.option.id))}</ul>
        </section>
      )}
    </>
  );
}
