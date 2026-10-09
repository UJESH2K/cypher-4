"use client";

import { Check, Hand, Inbox, MapPin, X } from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import { useEffect } from "react";
import { issueFigure, KindBadge, kindClass, Urgency } from "@/components/ui";
import type { SessionUser } from "@/lib/auth/roles";
import { type Key, type Lang, place, t } from "@/lib/i18n";
import { issueTitle, optionLabel } from "@/lib/present";
import type { ApprovalRequest, Dataset, Issue, IssueKind, Option } from "@/lib/types";
import IssueDetail from "./IssueDetail";
import type { Handled } from "./types";

type Props = {
  lang: Lang;
  user: SessionUser;
  data: Dataset;
  open: Issue[];
  done: Handled[];
  selectedId: string | null;
  wide: boolean;
  kind: IssueKind | "all";
  where: string | null;
  mine: boolean;
  rejected: Record<string, string[]>;
  requests: Record<string, ApprovalRequest>;
  onKind: (k: IssueKind | "all") => void;
  onWhere: (loc: string | null) => void;
  onMine: (v: boolean) => void;
  onSelect: (id: string) => void;
  onBack: () => void;
  onApprove: (issue: Issue, o: Option) => void;
  onReject: (issue: Issue, o: Option, reason: Key) => void;
  onRequest: (issue: Issue, o: Option) => void;
};

const KINDS: IssueKind[] = ["stockout", "overdue_po", "slow_stock", "supplier_fit", "demand_spike", "demand_drop"];

export default function ProblemsView(p: Props) {
  const { lang, user, data, open, done } = p;
  const T = (k: Key, v?: Record<string, string | number>) => t(lang, k, v);

  const match = (i: Issue) => (p.kind === "all" || i.kind === p.kind) && (!p.where || i.location === p.where);
  const shown = open.filter(match);
  const shownDone = done.filter((h) => match(h.issue));
  const counts = new Map<IssueKind, number>();
  for (const i of open) if (!p.where || i.location === p.where) counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1);
  const atWhere = open.filter((i) => !p.where || i.location === p.where).length;

  const active = open.find((i) => i.id === p.selectedId);
  const finished = p.selectedId ? done.find((h) => h.issue.id === p.selectedId) : undefined;
  const firstId = shown[0]?.id;

  // On a wide screen there is room for the detail, so open the top problem straight away.
  useEffect(() => {
    if (p.wide && !active && !finished && firstId) p.onSelect(firstId);
    // onSelect is a fresh function each render; the ids are what matter.
  }, [p.wide, active, finished, firstId]);

  const current = active ?? finished?.issue;
  const nextId = shown.find((i) => i.id !== current?.id)?.id;
  const hasDetail = Boolean(current);

  const row = (issue: Issue, rank: number, picked?: Option) => {
    const rec = picked ?? issue.options.find((o) => o.id === issue.recommended);
    const fig = issueFigure(lang, issue);
    const selected = current?.id === issue.id;
    const req = p.requests[issue.id];
    return (
      <li key={issue.id}>
        <button className={`prow ${kindClass(issue)}`} aria-current={selected ? "true" : undefined} onClick={() => p.onSelect(issue.id)}>
          {selected && <motion.span layoutId="prow-active" className="prow-bg" transition={{ type: "spring", stiffness: 480, damping: 40 }} />}
          <span className="prow-rail" aria-hidden="true" />
          <span className="prow-top">
            <KindBadge lang={lang} issue={issue} />
            {picked ? (
              <span className="urg" style={{ color: "var(--green-ink)" }}>
                <Check aria-hidden="true" />
                {T("done.approved")}
              </span>
            ) : (
              <Urgency lang={lang} issue={issue} />
            )}
            {req && !picked && (
              <span className="urg req">
                <Hand aria-hidden="true" />
                {T("done.requested")}
              </span>
            )}
          </span>
          <span className="prow-title">
            {rank > 0 && <span style={{ color: "var(--muted)", marginRight: 6 }}>{rank}.</span>}
            {issueTitle(lang, issue, data)}
          </span>
          <span className="prow-rec">{rec ? `${T(picked ? "done.approved" : "pick.label")}: ${optionLabel(lang, rec, issue)}` : T("pick.none")}</span>
          {fig && !picked && <span className={`prow-fig ${fig.tone}`}>{fig.value}</span>}
        </button>
      </li>
    );
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{T("nav.problems")}</h1>
          <p className="page-sub">{T("problems.sub")}</p>
        </div>
        {user.role === "store" && user.store && (
          <div className="seg" role="group" aria-label={T("scope.label")}>
            {[true, false].map((v) => (
              <button key={String(v)} aria-pressed={p.mine === v} onClick={() => p.onMine(v)}>
                {p.mine === v && <motion.span layoutId="scope-problems" className="seg-bg" />}
                <span>{v ? T("scope.mine", { store: place(lang, user.store as string) }) : T("scope.all")}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="toolbar" role="group" aria-label={T("filter.all")}>
        <LayoutGroup id="kinds">
          {(["all", ...KINDS] as const)
            .filter((k) => k === "all" || counts.has(k))
            .map((k) => {
              const on = p.kind === k;
              return (
                <button key={k} className={`fchip${k === "all" ? "" : ` k-${k}`}`} aria-pressed={on} onClick={() => p.onKind(k)}>
                  {on && <motion.span layoutId="fchip-bg" className="fchip-bg" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                  {k !== "all" && <span className="dot" aria-hidden="true" />}
                  <span>{k === "all" ? T("filter.all") : T(`kind.${k}` as Key)}</span>
                  <span className="n">{k === "all" ? atWhere : counts.get(k)}</span>
                </button>
              );
            })}
        </LayoutGroup>
        {p.where && (
          <button className="chip accent" style={{ minHeight: 36, padding: "0 12px" }} onClick={() => p.onWhere(null)} aria-label={`${T("filter.clear")}: ${place(lang, p.where)}`}>
            <MapPin aria-hidden="true" />
            {T("filter.at", { loc: place(lang, p.where) })}
            <X aria-hidden="true" />
          </button>
        )}
      </div>

      <div className={`split${hasDetail ? " has-detail" : ""}`}>
        <div className="split-list">
          {shown.length === 0 && shownDone.length === 0 ? (
            <div className="card empty-state" style={{ padding: "40px 20px" }}>
              <span className="ico">
                <Inbox size={26} aria-hidden="true" />
              </span>
              <p>{open.length ? T("filter.none") : T("list.empty")}</p>
              {(p.kind !== "all" || p.where) && (
                <button
                  className="btn sm"
                  onClick={() => {
                    p.onKind("all");
                    p.onWhere(null);
                  }}
                >
                  {T("filter.clear")}
                </button>
              )}
            </div>
          ) : (
            <>
              {shown.length > 0 && (
                <section className="group" aria-labelledby="g-first">
                  <h2 className="group-title" id="g-first">
                    {T("list.first")}
                  </h2>
                  <ol>{shown.slice(0, 3).map((i, n) => row(i, n + 1))}</ol>
                </section>
              )}
              {shown.length > 3 && (
                <section className="group" aria-labelledby="g-rest">
                  <h2 className="group-title" id="g-rest">
                    {T("list.rest")}
                    <span className="count-pill">{shown.length - 3}</span>
                  </h2>
                  <ol>{shown.slice(3).map((i, n) => row(i, n + 4))}</ol>
                </section>
              )}
              {shownDone.length > 0 && (
                <section className="group" aria-labelledby="g-done">
                  <h2 className="group-title" id="g-done">
                    {T("list.done")}
                    <span className="count-pill">{shownDone.length}</span>
                  </h2>
                  <ul>{shownDone.map((h) => row(h.issue, 0, h.option))}</ul>
                </section>
              )}
            </>
          )}
        </div>

        {active ? (
          <IssueDetail
            key={`${active.id}:${active.recommended}`}
            lang={lang}
            user={user}
            data={data}
            issue={active}
            rejected={p.rejected[active.id] ?? []}
            request={p.requests[active.id]}
            hasNext={Boolean(nextId)}
            autoFocus={!p.wide}
            onApprove={(o) => p.onApprove(active, o)}
            onReject={(o, r) => p.onReject(active, o, r)}
            onRequest={(o) => p.onRequest(active, o)}
            onBack={p.onBack}
            onNext={() => nextId && p.onSelect(nextId)}
          />
        ) : finished ? (
          <IssueDetail
            key={`done:${finished.issue.id}`}
            lang={lang}
            user={user}
            data={data}
            issue={finished.issue}
            rejected={p.rejected[finished.issue.id] ?? []}
            approved={finished}
            hasNext={Boolean(nextId)}
            autoFocus={!p.wide}
            onBack={p.onBack}
            onNext={() => nextId && p.onSelect(nextId)}
          />
        ) : (
          <div className="detail empty-detail">
            <Inbox size={36} aria-hidden="true" />
            <p>{shown.length ? T("list.pick") : T("brief.none")}</p>
          </div>
        )}
      </div>
    </>
  );
}
