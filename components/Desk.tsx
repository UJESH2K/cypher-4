"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { applyOption } from "@/lib/apply";
import { toIso } from "@/lib/dates";
import { analyse } from "@/lib/engine";
import { isLang, type Key, type Lang, LANGS, t } from "@/lib/i18n";
import { actionDone } from "@/lib/present";
import { buildSample } from "@/lib/sample";
import { DEFAULT_SETTINGS, type Dataset, type Issue, type LogEntry, type Option, type Settings } from "@/lib/types";
import Brief from "./Brief";
import ChatPanel from "./ChatPanel";
import DataView from "./DataView";
import IssueDetail from "./IssueDetail";
import IssueList from "./IssueList";
import LogView from "./LogView";

export type Handled = { issue: Issue; option: Option; at: string };
type View = "today" | "data" | "log";

const STORE = "kaveri-desk-v1";

function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1000px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

export default function Desk() {
  const [today, setToday] = useState("");
  const [lang, setLang] = useState<Lang>("en");
  const [data, setData] = useState<Dataset | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [rejected, setRejected] = useState<Record<string, string[]>>({});
  const [handled, setHandled] = useState<Record<string, Handled>>({});
  const [log, setLog] = useState<LogEntry[]>([]);
  const [view, setView] = useState<View>("today");
  const [selected, setSelected] = useState<string | null>(null);
  const [chat, setChat] = useState(false);
  const [notice, setNotice] = useState("");
  const [run, setRun] = useState(0);
  const wide = useWide();

  // Load: yesterday's saved session is discarded so the dates never go stale.
  useEffect(() => {
    const day = toIso(new Date());
    setToday(day);
    try {
      const raw = window.localStorage.getItem(STORE);
      const saved = raw ? JSON.parse(raw) : null;
      if (saved && isLang(saved.lang)) setLang(saved.lang);
      if (saved && saved.day === day && saved.data?.inventory) {
        setData(saved.data);
        setSettings({ ...DEFAULT_SETTINGS, ...saved.settings });
        setRejected(saved.rejected ?? {});
        setHandled(saved.handled ?? {});
        setLog(saved.log ?? []);
        return;
      }
    } catch {
      // Storage unavailable or corrupt: start from the sample.
    }
    setData(buildSample(day));
  }, []);

  useEffect(() => {
    if (!data || !today) return;
    try {
      window.localStorage.setItem(STORE, JSON.stringify({ day: today, lang, data, settings, rejected, handled, log }));
    } catch {
      // Quota or private mode: the app works without saving.
    }
  }, [today, lang, data, settings, rejected, handled, log]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(id);
  }, [notice]);

  // On a phone the detail replaces the list, so bring it to the top of the screen.
  useEffect(() => {
    if (selected && !wide) document.querySelector(".board")?.scrollIntoView({ block: "start" });
  }, [selected, wide]);

  const analysis = useMemo(() => (data && today ? analyse(data, settings, today, rejected) : null), [data, settings, today, rejected]);

  const open = useMemo(() => (analysis ? analysis.issues.filter((i) => !handled[i.id]) : []), [analysis, handled]);
  const done = useMemo(() => Object.values(handled).sort((a, b) => b.at.localeCompare(a.at)), [handled]);

  const activeId = selected ?? (wide ? open[0]?.id ?? null : null);
  const activeOpen = open.find((i) => i.id === activeId);
  const activeDone = activeId ? handled[activeId] : undefined;

  const approve = useCallback(
    (issue: Issue, option: Option) => {
      if (!data) return;
      const at = new Date().toISOString();
      setData(applyOption(data, option));
      setHandled((h) => ({ ...h, [issue.id]: { issue, option, at } }));
      setLog((l) => [{ id: `${at}-${issue.id}`, at, decision: "approved", issueId: issue.id, kind: issue.kind, sku: issue.sku, location: issue.location, option }, ...l]);
      setSelected(issue.id);
      setNotice([t(lang, "done.approved") + ".", ...option.actions.map((a) => actionDone(lang, a))].join(" "));
    },
    [data, lang],
  );

  const reject = useCallback(
    (issue: Issue, option: Option, reason: Key) => {
      const at = new Date().toISOString();
      setRejected((r) => ({ ...r, [issue.id]: [...(r[issue.id] ?? []), option.id] }));
      setLog((l) => [{ id: `${at}-${issue.id}`, at, decision: "rejected", issueId: issue.id, kind: issue.kind, sku: issue.sku, location: issue.location, option, reason }, ...l]);
      setNotice(t(lang, "done.replan"));
    },
    [lang],
  );

  const changeData = useCallback(
    (next: Dataset) => {
      setData(next);
      setNotice(t(lang, "data.changed"));
    },
    [lang],
  );

  const reset = useCallback(() => {
    if (!today) return;
    setData(buildSample(today));
    setSettings(DEFAULT_SETTINGS);
    setRejected({});
    setHandled({});
    setLog([]);
    setSelected(null);
    setNotice(t(lang, "data.changed"));
  }, [today, lang]);

  const T = (k: Key) => t(lang, k);

  return (
    <>
      <div className="hazard" aria-hidden="true" />
      <header className="top">
        <div className="wrap top-row">
          <div className="brand">
            <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
              <path d="M17 1.5 30.4 9.25v15.5L17 32.5 3.6 24.75V9.25z" fill="#f5b800" />
              <circle cx="17" cy="17" r="6.5" fill="#15232d" />
            </svg>
            <div>
              <div className="brand-name">{T("app.name")}</div>
              <div className="brand-sub">{T("app.tagline")}</div>
            </div>
          </div>
          <nav className="tabs" aria-label="Sections">
            {(["today", "data", "log"] as View[]).map((v) => (
              <button key={v} className="tab" aria-current={view === v ? "page" : undefined} onClick={() => setView(v)}>
                {T(`nav.${v}` as Key)}
              </button>
            ))}
          </nav>
          <div className="top-tools">
            <label className="sr-only" htmlFor="lang">
              {T("lang.label")}
            </label>
            <select id="lang" className="select" value={lang} onChange={(e) => isLang(e.target.value) && setLang(e.target.value)}>
              {LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
            <button className="btn yellow" onClick={() => setChat(true)}>
              {T("nav.ask")}
            </button>
          </div>
        </div>
      </header>

      {!data || !analysis ? (
        <div className="loading" role="status">
          <p>
            <span className="pulse" />
            {T("loading")}
          </p>
        </div>
      ) : (
        <>
          {view === "today" && (
            <>
              <Brief lang={lang} analysis={analysis} data={data} open={open} doneCount={done.length} run={run} onRecheck={() => setRun((r) => r + 1)} />
              <main className="main">
                <div className={`wrap board${activeId ? " has-detail" : ""}`}>
                  <div className="lists">
                    <IssueList lang={lang} data={data} open={open} done={done} activeId={activeId} onSelect={setSelected} />
                  </div>
                  {activeOpen ? (
                    <IssueDetail
                      key={`${activeOpen.id}:${activeOpen.recommended}`}
                      lang={lang}
                      data={data}
                      issue={activeOpen}
                      rejected={rejected[activeOpen.id] ?? []}
                      onApprove={(o) => approve(activeOpen, o)}
                      onReject={(o, why) => reject(activeOpen, o, why)}
                      onBack={() => setSelected(null)}
                    />
                  ) : activeDone ? (
                    <IssueDetail
                      key={`done:${activeDone.issue.id}`}
                      lang={lang}
                      data={data}
                      issue={activeDone.issue}
                      rejected={rejected[activeDone.issue.id] ?? []}
                      approved={activeDone}
                      onBack={() => setSelected(null)}
                    />
                  ) : (
                    <div className="detail">
                      <div className="block">
                        <p className="issue-meta">{open.length ? T("list.pick") : T("brief.none")}</p>
                      </div>
                    </div>
                  )}
                </div>
              </main>
            </>
          )}
          {view === "data" && (
            <main className="main">
              <div className="wrap">
                <DataView lang={lang} data={data} settings={settings} asOf={analysis.asOf} onData={changeData} onSettings={setSettings} onReset={reset} />
              </div>
            </main>
          )}
          {view === "log" && (
            <main className="main">
              <div className="wrap">
                <LogView lang={lang} data={data} log={log} onClear={() => setLog([])} />
              </div>
            </main>
          )}
          {chat && <ChatPanel lang={lang} data={data} analysis={analysis} settings={settings} handled={handled} onClose={() => setChat(false)} />}
        </>
      )}

      <div aria-live="polite" role="status">
        {notice && <div className="toast">{notice}</div>}
      </div>
    </>
  );
}
