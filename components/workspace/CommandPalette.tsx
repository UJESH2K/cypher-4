"use client";

import { Check, CornerDownLeft, Database, History, Inbox, Languages, LayoutDashboard, LogOut, Moon, RefreshCw, Search, Sparkles, Sun } from "lucide-react";
import { motion } from "motion/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { kindClass } from "@/components/ui";
import type { SessionUser } from "@/lib/auth/roles";
import { type Key, type Lang, LANGS, place, t } from "@/lib/i18n";
import { issueTitle, partName } from "@/lib/present";
import type { Dataset, Issue } from "@/lib/types";
import type { Theme, View } from "./types";

type Props = {
  lang: Lang;
  user: SessionUser;
  data: Dataset | null;
  issues: Issue[];
  theme: Theme;
  onClose: () => void;
  onNavigate: (v: View) => void;
  onOpenIssue: (id: string) => void;
  onAsk: () => void;
  onLang: (l: Lang) => void;
  onTheme: () => void;
  onRecheck: () => void;
  onSignOut: () => void;
};

type Item = { id: string; group: Key; label: string; search: string; icon: ReactNode; hint?: ReactNode; run: () => void };

export default function CommandPalette(p: Props) {
  const { lang, data, issues } = p;
  const T = (k: Key, v?: Record<string, string | number>) => t(lang, k, v);
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const back = useRef<Element | null>(null);

  useEffect(() => {
    back.current = document.activeElement;
    input.current?.focus();
    return () => {
      if (back.current instanceof HTMLElement) back.current.focus();
    };
  }, []);

  const items = useMemo<Item[]>(() => {
    const nav: [View, Key, ReactNode][] = [
      ["today", "nav.today", <LayoutDashboard key="i" size={17} />],
      ["problems", "nav.problems", <Inbox key="i" size={17} />],
      ["decisions", "nav.log", <History key="i" size={17} />],
      ["records", "nav.data", <Database key="i" size={17} />],
    ];
    const out: Item[] = nav.map(([v, k, icon]) => ({ id: `nav-${v}`, group: "cmd.go", label: T(k), search: `${T(k)} ${k}`, icon, run: () => p.onNavigate(v) }));
    out.push({ id: "ask", group: "cmd.go", label: T("nav.ask"), search: `${T("nav.ask")} chat ask`, icon: <Sparkles size={17} />, run: p.onAsk });
    if (data) {
      for (const i of issues) {
        const title = issueTitle(lang, i, data);
        out.push({
          id: `issue-${i.id}`,
          group: "nav.problems",
          label: title,
          search: `${title} ${i.sku} ${partName(data, i.sku)} ${i.location} ${place(lang, i.location)} ${i.po ?? ""} ${i.supplier ?? ""}`,
          icon: <span className={`dot ${kindClass(i)}`} style={{ margin: "0 5px" }} aria-hidden="true" />,
          run: () => p.onOpenIssue(i.id),
        });
      }
    }
    out.push({ id: "recheck", group: "cmd.actions", label: T("brief.recheck"), search: `${T("brief.recheck")} refresh`, icon: <RefreshCw size={17} />, run: p.onRecheck });
    out.push({
      id: "theme",
      group: "cmd.actions",
      label: T(p.theme === "dark" ? "theme.toLight" : "theme.toDark"),
      search: `${T(p.theme === "dark" ? "theme.toLight" : "theme.toDark")} theme dark light`,
      icon: p.theme === "dark" ? <Sun size={17} /> : <Moon size={17} />,
      run: p.onTheme,
    });
    for (const l of LANGS) {
      out.push({
        id: `lang-${l.code}`,
        group: "lang.label",
        label: `${l.name} · ${l.english}`,
        search: `${l.name} ${l.english} language`,
        icon: <Languages size={17} />,
        hint: l.code === lang ? <Check size={16} style={{ color: "var(--accent)" }} /> : undefined,
        run: () => p.onLang(l.code),
      });
    }
    out.push({ id: "signout", group: "cmd.actions", label: T("nav.signout"), search: `${T("nav.signout")} logout sign out`, icon: <LogOut size={17} />, run: p.onSignOut });
    return out;
    // The handlers are fresh functions each render; the list only changes with these.
  }, [lang, data, issues, p.theme]);

  const needle = q.trim().toLowerCase();
  const shown = needle ? items.filter((i) => needle.split(/\s+/).every((w) => i.search.toLowerCase().includes(w))) : items;
  const safe = Math.min(index, Math.max(0, shown.length - 1));

  useEffect(() => setIndex(0), [q]);

  useEffect(() => {
    list.current?.querySelector(`[data-i="${safe}"]`)?.scrollIntoView({ block: "nearest" });
  }, [safe]);

  const run = (item: Item | undefined) => {
    if (!item) return;
    p.onClose();
    item.run();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(shown[safe]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      p.onClose();
    }
  };

  let lastGroup: Key | null = null;

  return (
    <div className="palette-wrap" onKeyDown={onKey}>
      <motion.div className="scrim" style={{ zIndex: -1 }} aria-hidden="true" onClick={p.onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label={T("nav.search")}
        initial={{ opacity: 0, y: -12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98, transition: { duration: 0.12 } }}
        transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <div className="palette-input">
          <Search size={19} aria-hidden="true" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={T("cmd.placeholder")}
            aria-label={T("cmd.placeholder")}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={shown[safe] ? `pi-${safe}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          <span className="kbd">Esc</span>
        </div>
        <div className="palette-list" id="palette-list" role="listbox" ref={list} aria-label={T("nav.search")}>
          {shown.length === 0 && <p className="palette-empty">{T("cmd.empty")}</p>}
          {shown.map((item, i) => {
            const head = item.group !== lastGroup ? T(item.group) : null;
            lastGroup = item.group;
            return (
              <div key={item.id}>
                {head && (
                  <div className="palette-group" aria-hidden="true">
                    {head}
                  </div>
                )}
                <button
                  id={`pi-${i}`}
                  data-i={i}
                  className="palette-item"
                  role="option"
                  aria-selected={i === safe}
                  tabIndex={-1}
                  onMouseMove={() => i !== safe && setIndex(i)}
                  onClick={() => run(item)}
                >
                  {item.icon}
                  <span className="lbl">{item.label}</span>
                  {item.hint ?? (i === safe ? <CornerDownLeft size={15} className="hint" aria-hidden="true" /> : null)}
                </button>
              </div>
            );
          })}
        </div>
        <div className="palette-foot">{T("cmd.keys")}</div>
      </motion.div>
    </div>
  );
}
