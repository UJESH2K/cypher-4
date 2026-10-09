"use client";

import { Check, ChevronsUpDown, Database, HardDrive, History, Inbox, Languages, LayoutDashboard, LogOut, Moon, PanelLeftClose, PanelLeftOpen, RefreshCw, Search, Sparkles, Sun } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Avatar, BrandMark, roleCan, roleLabel } from "@/components/ui";
import type { SessionUser } from "@/lib/auth/roles";
import { type Key, type Lang, LANGS, localeOf, t } from "@/lib/i18n";
import type { AgentRunInfo, Mode, Theme, View } from "./types";

type Props = {
  lang: Lang;
  user: SessionUser;
  view: View;
  counts: { problems: number; urgent: number; decisions: number };
  mini: boolean;
  theme: Theme;
  checkedAt: Date | null;
  mode: Mode;
  lastRun: AgentRunInfo | null;
  onNavigate: (v: View) => void;
  onAsk: () => void;
  onSearch: () => void;
  onToggleMini: () => void;
  onTheme: () => void;
  onLang: (l: Lang) => void;
  onRecheck: () => void;
  onSignOut: () => void;
};

const NAV: { view: View; key: Key; icon: typeof Inbox }[] = [
  { view: "today", key: "nav.today", icon: LayoutDashboard },
  { view: "problems", key: "nav.problems", icon: Inbox },
  { view: "decisions", key: "nav.log", icon: History },
  { view: "records", key: "nav.data", icon: Database },
];

/** Closes a popover on outside click or Escape. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

function Pop({ open, children, label }: { open: boolean; children: ReactNode; label: string }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="pop up"
          role="menu"
          aria-label={label}
          initial={{ opacity: 0, y: 8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.98, transition: { duration: 0.12 } }}
          transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          style={{ transformOrigin: "bottom left" }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function Sidebar(p: Props) {
  const { lang, user, view, counts, mini } = p;
  const T = (k: Key, v?: Record<string, string | number>) => t(lang, k, v);
  const langMenu = usePopover();
  const userMenu = usePopover();
  const [isMac, setIsMac] = useState(false);
  useEffect(() => setIsMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)), []);

  const time = p.checkedAt ? new Intl.DateTimeFormat(localeOf(lang), { hour: "numeric", minute: "2-digit" }).format(p.checkedAt) : "";
  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];
  const tip = (k: string) => (mini ? k : undefined);

  return (
    <aside className="sidebar" aria-label={T("app.name")}>
      <div className="side-top">
        <a className="brand" href="#/" onClick={(e) => { e.preventDefault(); p.onNavigate("today"); }} title={tip(T("app.name"))}>
          <BrandMark />
          <span className="brand-text">
            <span className="brand-name">{T("app.name")}</span>
            <span className="brand-sub" style={{ display: "block" }}>Kaveri Spares &amp; Hydraulics</span>
          </span>
        </a>
        <button className="icon-btn side-toggle" onClick={p.onToggleMini} aria-label={T(mini ? "nav.expand" : "nav.collapse")} title={T(mini ? "nav.expand" : "nav.collapse")}>
          {mini ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      <button className="side-search" onClick={p.onSearch} title={tip(T("nav.search"))} aria-label={mini ? T("nav.search") : undefined}>
        <Search size={16} aria-hidden="true" />
        <span>{T("nav.search")}</span>
        <span className="kbd" aria-hidden="true">
          {isMac ? "⌘" : "Ctrl"} K
        </span>
      </button>

      <div className="side-label">{T("nav.workspace")}</div>
      <nav className="nav" aria-label={T("nav.workspace")}>
        {NAV.map(({ view: v, key, icon: Icon }) => {
          const n = v === "problems" ? counts.problems : v === "decisions" ? counts.decisions : 0;
          return (
            <button key={v} className="nav-item" aria-current={view === v ? "page" : undefined} onClick={() => p.onNavigate(v)} title={tip(T(key))}>
              {view === v && <motion.span layoutId="nav-active" className="nav-active" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
              <Icon size={19} aria-hidden="true" />
              <span className="nav-text">{T(key)}</span>
              {n > 0 && <span className={`nav-count${v === "problems" && counts.urgent > 0 ? " hot" : ""}`}>{n}</span>}
            </button>
          );
        })}
        <button className="nav-item" onClick={p.onAsk} title={tip(T("nav.ask"))}>
          <Sparkles size={19} aria-hidden="true" style={{ color: "var(--brass)" }} />
          <span className="nav-text">{T("nav.ask")}</span>
        </button>
      </nav>

      <div className="side-spacer" />

      <div className="side-status" role="status">
        <div className="side-status-top">
          <span className="live" aria-hidden="true" />
          {T("map.count", { n: counts.problems })}
        </div>
        <div>{time && T("nav.status", { time })}</div>
        {p.mode !== "loading" && (
          <div className="side-sync">
            {p.mode === "server" ? <Database size={13} aria-hidden="true" /> : <HardDrive size={13} aria-hidden="true" />}
            <span>
              {T(p.mode === "server" ? "sync.server" : "sync.local")}
              {p.mode === "server" && p.lastRun ? <small>{T("nav.run", { ms: p.lastRun.ms })}</small> : null}
            </span>
          </div>
        )}
        <button onClick={p.onRecheck}>
          <RefreshCw size={13} aria-hidden="true" />
          {T("brief.recheck")}
        </button>
      </div>

      <div className="side-tools">
        <div ref={langMenu.ref} style={{ position: "relative", flex: 1, display: "flex" }}>
          <button
            className="side-tool grow"
            aria-haspopup="menu"
            aria-expanded={langMenu.open}
            onClick={() => langMenu.setOpen((o) => !o)}
            title={tip(T("lang.label"))}
            aria-label={`${T("lang.label")}: ${current.name}`}
          >
            <Languages size={17} aria-hidden="true" />
            <span lang={current.code}>{current.name}</span>
            <ChevronsUpDown size={14} aria-hidden="true" style={{ opacity: 0.6 }} />
          </button>
          <Pop open={langMenu.open} label={T("lang.label")}>
            <div className="pop-title">{T("lang.label")}</div>
            {LANGS.map((l) => (
              <button
                key={l.code}
                className="pop-item"
                role="menuitemradio"
                aria-checked={lang === l.code}
                onClick={() => {
                  p.onLang(l.code);
                  langMenu.setOpen(false);
                }}
              >
                <span className="native" lang={l.code}>
                  {l.name}
                </span>
                <span className="english">{l.english}</span>
                {lang === l.code && <Check size={16} style={{ color: "var(--accent)" }} aria-hidden="true" />}
              </button>
            ))}
          </Pop>
        </div>
        <button className="side-tool square" onClick={p.onTheme} aria-label={T(p.theme === "dark" ? "theme.toLight" : "theme.toDark")} title={T(p.theme === "dark" ? "theme.toLight" : "theme.toDark")}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={p.theme} initial={{ rotate: -60, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 60, opacity: 0 }} transition={{ duration: 0.2 }} style={{ display: "grid" }}>
              {p.theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </motion.span>
          </AnimatePresence>
        </button>
      </div>

      <div ref={userMenu.ref} style={{ position: "relative" }}>
        <button className="user-card" aria-haspopup="menu" aria-expanded={userMenu.open} onClick={() => userMenu.setOpen((o) => !o)} title={tip(user.name)}>
          <Avatar user={user} />
          <span className="user-meta">
            <span className="user-name" style={{ display: "block" }}>
              {user.name}
            </span>
            <span className="user-role" style={{ display: "block" }}>
              {roleLabel(lang, user)}
            </span>
          </span>
          <ChevronsUpDown size={15} aria-hidden="true" style={{ color: "var(--side-muted)" }} />
        </button>
        <Pop open={userMenu.open} label={user.name}>
          <div className="pop-note">
            <b>{user.name}</b>
            {roleLabel(lang, user)}
            <div style={{ marginTop: 6 }}>{roleCan(lang, user)}</div>
          </div>
          <button className="pop-item danger" role="menuitem" onClick={p.onSignOut}>
            <LogOut size={16} aria-hidden="true" />
            {T("nav.signout")}
          </button>
        </Pop>
      </div>
    </aside>
  );
}
