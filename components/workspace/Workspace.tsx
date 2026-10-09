"use client";

import { Menu, Search, Sparkles } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrandMark } from "@/components/ui";
import { applyOption } from "@/lib/apply";
import { type SessionUser, touchesStore } from "@/lib/auth/roles";
import { toIso } from "@/lib/dates";
import { analyse } from "@/lib/engine";
import { type Key, type Lang, t } from "@/lib/i18n";
import { saveLang } from "@/lib/lang-cookie";
import { actionDone } from "@/lib/present";
import { buildSample } from "@/lib/sample";
import { type ApprovalRequest, type Dataset, DEFAULT_SETTINGS, type Issue, type IssueKind, type LogEntry, type Option, type Settings } from "@/lib/types";
import ChatDrawer from "./ChatDrawer";
import CommandPalette from "./CommandPalette";
import DecisionsView from "./DecisionsView";
import ProblemsView from "./ProblemsView";
import RecordsView from "./RecordsView";
import Sidebar from "./Sidebar";
import TodayView from "./TodayView";
import Toasts from "./Toasts";
import { type Handled, type Route, type Theme, type Toast, type View, VIEWS } from "./types";

const STORE = "kaveri-desk-v2";
const SIDEBAR = "kd-sidebar";

function readHash(): Route {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [head, ...rest] = raw.split("/");
  const view = (VIEWS as string[]).includes(head) ? (head as View) : "today";
  let id: string | null = null;
  if (view === "problems" && rest.length) {
    try {
      id = decodeURIComponent(rest.join("/"));
    } catch {
      id = null;
    }
  }
  return { view, id };
}

function hashOf(r: Route): string {
  if (r.view === "today") return "#/";
  return `#/${r.view}${r.id ? `/${encodeURIComponent(r.id)}` : ""}`;
}

function useMedia(query: string) {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

type Props = { user: SessionUser; initialLang: Lang };

export default function Workspace({ user, initialLang }: Props) {
  const [today, setToday] = useState("");
  const [lang, setLang] = useState<Lang>(initialLang);
  const [data, setData] = useState<Dataset | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [rejected, setRejected] = useState<Record<string, string[]>>({});
  const [handled, setHandled] = useState<Record<string, Handled>>({});
  const [log, setLog] = useState<LogEntry[]>([]);
  const [requests, setRequests] = useState<Record<string, ApprovalRequest>>({});
  const [route, setRoute] = useState<Route>({ view: "today", id: null });
  const [kind, setKind] = useState<IssueKind | "all">("all");
  const [where, setWhere] = useState<string | null>(null);
  const [mine, setMine] = useState(user.role === "store");
  const [chat, setChat] = useState(false);
  const [palette, setPalette] = useState(false);
  const [mini, setMini] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [run, setRun] = useState(0);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const wide = useMedia("(min-width: 1061px)");
  const T = useCallback((k: Key, v?: Record<string, string | number>) => t(lang, k, v), [lang]);

  // Load. A saved session from an earlier day is dropped so dates never go stale.
  useEffect(() => {
    const day = toIso(new Date());
    setToday(day);
    setRoute(readHash());
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    setCheckedAt(new Date());
    try {
      setMini(window.localStorage.getItem(SIDEBAR) === "mini");
      const raw = window.localStorage.getItem(STORE);
      const saved = raw ? JSON.parse(raw) : null;
      if (saved && saved.day === day && saved.data?.inventory) {
        setData(saved.data);
        setSettings({ ...DEFAULT_SETTINGS, ...saved.settings });
        setRejected(saved.rejected ?? {});
        setHandled(saved.handled ?? {});
        setLog(saved.log ?? []);
        setRequests(saved.requests ?? {});
        return;
      }
    } catch {
      // Storage blocked or corrupt: start from the sample.
    }
    setData(buildSample(day));
  }, []);

  useEffect(() => {
    if (!data || !today) return;
    try {
      window.localStorage.setItem(STORE, JSON.stringify({ day: today, data, settings, rejected, handled, log, requests }));
    } catch {
      // Quota or private mode: the desk still works, it just will not remember.
    }
  }, [today, data, settings, rejected, handled, log, requests]);

  useEffect(() => {
    const onPop = () => setRoute(readHash());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Ctrl/Cmd+K opens the command palette from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      } else if (e.key === "Escape") {
        setNavOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toast = useCallback((tone: Toast["tone"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list.slice(-2), { id, tone, text }]);
    window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 5200);
  }, []);

  // Notice an expired session (12 hours) instead of failing silently.
  useEffect(() => {
    let gone = false;
    const check = async () => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        if (res.status === 401 && !gone) {
          gone = true;
          toast("error", t(lang, "auth.expired"));
          window.setTimeout(() => window.location.assign("/login"), 1800);
        }
      } catch {
        // Offline: try again later.
      }
    };
    const id = window.setInterval(check, 5 * 60 * 1000);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", check);
    };
  }, [lang, toast]);

  const analysis = useMemo(() => (data && today ? analyse(data, settings, today, rejected) : null), [data, settings, today, rejected]);
  const open = useMemo(() => (analysis ? analysis.issues.filter((i) => !handled[i.id]) : []), [analysis, handled]);
  const scoped = useMemo(() => (mine && user.store ? open.filter((i) => touchesStore(i, user.store as string)) : open), [open, mine, user.store]);
  const done = useMemo(() => Object.values(handled).sort((a, b) => b.at.localeCompare(a.at)), [handled]);
  const liveRequests = useMemo(() => Object.values(requests).filter((r) => open.some((i) => i.id === r.issueId)), [requests, open]);

  const routeRef = useRef(route);
  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  const go = useCallback((view: View, id: string | null = null, opts: { replace?: boolean } = {}) => {
    const next = { view, id };
    if (routeRef.current.view !== view) window.scrollTo({ top: 0 });
    routeRef.current = next;
    setRoute(next);
    setNavOpen(false);
    const hash = hashOf(next);
    if (window.location.hash !== hash) {
      if (opts.replace) window.history.replaceState(null, "", hash);
      else window.history.pushState(null, "", hash);
    }
  }, []);

  const openIssue = useCallback(
    (id: string) => {
      go("problems", id);
      if (!wide) window.scrollTo({ top: 0 });
    },
    [go, wide],
  );

  const changeLang = useCallback((l: Lang) => {
    setLang(l);
    saveLang(l);
  }, []);

  const changeTheme = useCallback(() => {
    setTheme((cur) => {
      const next: Theme = cur === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try {
        window.localStorage.setItem("kd-theme", next);
      } catch {
        // The choice just will not be remembered.
      }
      return next;
    });
  }, []);

  const toggleMini = useCallback(() => {
    setMini((m) => {
      try {
        window.localStorage.setItem(SIDEBAR, m ? "full" : "mini");
      } catch {
        // Not remembered; fine.
      }
      return !m;
    });
  }, []);

  const recheck = useCallback(() => {
    setRun((r) => r + 1);
    setCheckedAt(new Date());
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.assign("/login");
    }
  }, []);

  const entry = (issue: Issue, option: Option, decision: LogEntry["decision"], reason?: string): LogEntry => {
    const at = new Date().toISOString();
    return { id: `${at}-${issue.id}-${decision}`, at, decision, issueId: issue.id, kind: issue.kind, sku: issue.sku, location: issue.location, option, reason, by: user.name };
  };

  const approve = (issue: Issue, option: Option) => {
    if (!data) return;
    const at = new Date().toISOString();
    setData(applyOption(data, option));
    setHandled((h) => ({ ...h, [issue.id]: { issue, option, at, by: user.name } }));
    setLog((l) => [entry(issue, option, "approved"), ...l]);
    setRequests((r) => {
      const { [issue.id]: _gone, ...rest } = r;
      return rest;
    });
    toast("success", [T("done.approved") + ".", ...option.actions.map((a) => actionDone(lang, a))].join(" "));
  };

  const reject = (issue: Issue, option: Option, reason: Key) => {
    setRejected((r) => ({ ...r, [issue.id]: [...(r[issue.id] ?? []), option.id] }));
    setLog((l) => [entry(issue, option, "rejected", reason), ...l]);
    setRequests((r) => {
      const { [issue.id]: _gone, ...rest } = r;
      return rest;
    });
    toast("info", T("done.replan"));
  };

  const request = (issue: Issue, option: Option) => {
    const at = new Date().toISOString();
    setRequests((r) => ({ ...r, [issue.id]: { issueId: issue.id, optionId: option.id, by: user.id, byName: user.name, at } }));
    setLog((l) => [entry(issue, option, "requested"), ...l]);
    toast("info", T("detail.requested"));
  };

  const changeData = (next: Dataset) => {
    setData(next);
    setCheckedAt(new Date());
    toast("info", T("data.changed"));
  };

  const reset = () => {
    if (!today) return;
    setData(buildSample(today));
    setSettings(DEFAULT_SETTINGS);
    setRejected({});
    setHandled({});
    setLog([]);
    setRequests({});
    setCheckedAt(new Date());
    go("today");
    toast("info", T("data.changed"));
  };

  const pickLocation = (loc: string) => {
    setWhere(loc);
    setKind("all");
    go("problems");
  };

  const counts = {
    problems: scoped.length,
    urgent: scoped.filter((i) => (i.kind === "stockout" || i.kind === "overdue_po") && i.urgencyDays <= 3).length,
    decisions: log.length,
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className={`shell${mini ? " mini" : ""}${navOpen ? " nav-open" : ""}`} lang={lang}>
        <Sidebar
          lang={lang}
          user={user}
          view={route.view}
          counts={counts}
          mini={mini}
          theme={theme}
          checkedAt={checkedAt}
          onNavigate={(v) => go(v)}
          onAsk={() => {
            setNavOpen(false);
            setChat(true);
          }}
          onSearch={() => {
            setNavOpen(false);
            setPalette(true);
          }}
          onToggleMini={toggleMini}
          onTheme={changeTheme}
          onLang={changeLang}
          onRecheck={recheck}
          onSignOut={signOut}
        />
        <AnimatePresence>
          {navOpen && (
            <motion.div className="scrim" aria-hidden="true" onClick={() => setNavOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          )}
        </AnimatePresence>

        <div className="main">
          <header className="topbar">
            <button className="icon-btn" onClick={() => setNavOpen(true)} aria-label={T("nav.menu")} aria-expanded={navOpen}>
              <Menu size={20} />
            </button>
            <a className="brand" href="#/" onClick={(e) => { e.preventDefault(); go("today"); }}>
              <BrandMark />
              <span className="brand-name">{T("app.name")}</span>
            </a>
            <button className="icon-btn" onClick={() => setPalette(true)} aria-label={T("nav.search")}>
              <Search size={19} />
            </button>
            <button className="btn sm primary topbar-ask" onClick={() => setChat(true)} aria-label={T("nav.ask")}>
              <Sparkles size={15} aria-hidden="true" />
              <span>{T("nav.ask")}</span>
            </button>
          </header>

          <main id="main">
            {!data || !analysis ? (
              <div className="page" role="status" aria-label={T("loading")}>
                <div className="skeleton">
                  <div className="sk" style={{ height: 120, maxWidth: 560 }} />
                  <div className="kpis">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="sk" style={{ height: 128 }} />
                    ))}
                  </div>
                  <div className="sk" style={{ height: 150 }} />
                  <div className="sk" style={{ height: 320 }} />
                </div>
              </div>
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={route.view}
                  className="page"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
                >
                  {route.view === "today" && (
                    <TodayView
                      lang={lang}
                      user={user}
                      data={data}
                      analysis={analysis}
                      open={scoped}
                      doneCount={done.length}
                      requests={user.role === "purchasing" ? liveRequests : []}
                      mine={mine}
                      run={run}
                      checkedAt={checkedAt}
                      onMine={setMine}
                      onOpen={openIssue}
                      onAll={() => go("problems")}
                      onRecheck={recheck}
                      onAsk={() => setChat(true)}
                      onPickLocation={pickLocation}
                    />
                  )}
                  {route.view === "problems" && (
                    <ProblemsView
                      lang={lang}
                      user={user}
                      data={data}
                      open={scoped}
                      done={done}
                      selectedId={route.id}
                      wide={wide}
                      kind={kind}
                      where={where}
                      mine={mine}
                      rejected={rejected}
                      requests={requests}
                      onKind={setKind}
                      onWhere={setWhere}
                      onMine={setMine}
                      onSelect={(id) => go("problems", id, { replace: wide })}
                      onBack={() => go("problems")}
                      onApprove={approve}
                      onReject={reject}
                      onRequest={request}
                    />
                  )}
                  {route.view === "decisions" && <DecisionsView lang={lang} data={data} log={log} onClear={() => setLog([])} onOpen={openIssue} />}
                  {route.view === "records" && (
                    <RecordsView
                      lang={lang}
                      user={user}
                      data={data}
                      settings={settings}
                      asOf={analysis.asOf}
                      onData={changeData}
                      onSettings={setSettings}
                      onReset={reset}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            )}
          </main>
        </div>

        <AnimatePresence>
          {chat && data && analysis && (
            <ChatDrawer lang={lang} data={data} analysis={analysis} settings={settings} handled={handled} onClose={() => setChat(false)} />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {palette && (
            <CommandPalette
              lang={lang}
              user={user}
              data={data}
              issues={scoped}
              theme={theme}
              onClose={() => setPalette(false)}
              onNavigate={(v) => go(v)}
              onOpenIssue={openIssue}
              onAsk={() => setChat(true)}
              onLang={changeLang}
              onTheme={changeTheme}
              onRecheck={recheck}
              onSignOut={signOut}
            />
          )}
        </AnimatePresence>
        <Toasts toasts={toasts} closeLabel={T("chat.close")} onDismiss={(id) => setToasts((l) => l.filter((x) => x.id !== id))} />
      </div>
    </MotionConfig>
  );
}
