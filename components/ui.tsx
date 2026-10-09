"use client";

import { Boxes, Clock, Hourglass, MapPin, PackageOpen, PackageX, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { Fragment, type ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import type { Role, SessionUser } from "@/lib/auth/roles";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { DICTS, en, type Key, type Lang, days, money, place, t } from "@/lib/i18n";
import { kindKey } from "@/lib/present";
import type { Issue } from "@/lib/types";

/** The Kaveri mark: a hydraulic hex nut holding a drop of the river. */
export function BrandMark({ className = "brand-mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id="km-brass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0cf86" />
          <stop offset="1" stopColor="#a87822" />
        </linearGradient>
        <linearGradient id="km-drop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7fe0bd" />
          <stop offset="1" stopColor="#1f8a6a" />
        </linearGradient>
      </defs>
      <path d="M20 2.5 35.2 11.25v17.5L20 37.5 4.8 28.75v-17.5z" fill="url(#km-brass)" />
      <path d="M20 6.6 31.6 13.3v13.4L20 33.4 8.4 26.7V13.3z" fill="#10201b" />
      <path d="M20 11.5c3.6 4.6 5.6 7.9 5.6 10.6a5.6 5.6 0 0 1-11.2 0c0-2.7 2-6 5.6-10.6z" fill="url(#km-drop)" />
    </svg>
  );
}

const KIND_ICON: Record<string, LucideIcon> = {
  "kind.stockout": PackageX,
  "kind.reorder": PackageOpen,
  "kind.overdue_po": Clock,
  "kind.slow_stock": Hourglass,
  "kind.supplier_fit": Boxes,
  "kind.demand_spike": TrendingUp,
  "kind.demand_drop": TrendingDown,
};

/** CSS class that sets the --k colour family for an issue's kind. */
export function kindClass(issue: Issue): string {
  return `k-${kindKey(issue).replace("kind.", "")}`;
}

export function KindBadge({ lang, issue }: { lang: Lang; issue: Issue }) {
  const key = kindKey(issue);
  const Icon = KIND_ICON[key] ?? PackageX;
  return (
    <span className={`kind ${kindClass(issue)}`}>
      <span className="kind-ico" aria-hidden="true">
        <Icon />
      </span>
      <span className="kind-label">{t(lang, key)}</span>
    </span>
  );
}

export function Urgency({ lang, issue }: { lang: Lang; issue: Issue }) {
  const d = Math.max(0, Math.floor(issue.urgencyDays));
  if (issue.kind === "slow_stock" || issue.kind === "demand_drop") return null;
  const cls = d < 1 ? "now" : d <= 3 ? "soon" : "";
  return (
    <span className={`urg ${cls}`}>
      <Clock aria-hidden="true" />
      {d < 1 ? t(lang, "urg.today") : t(lang, "urg.in", { days: days(d) })}
    </span>
  );
}

export function Loc({ lang, name }: { lang: Lang; name: string }) {
  return (
    <span className="loc">
      <MapPin aria-hidden="true" />
      {place(lang, name)}
    </span>
  );
}

/** The money figure that best sums up an issue: sales at risk, or cash tied up. */
export function issueFigure(lang: Lang, issue: Issue): { label: string; value: string; tone: "red" | "blue" } | null {
  if (issue.kind === "slow_stock" || issue.kind === "demand_drop" || issue.kind === "supplier_fit")
    return { label: t(lang, "total.stuck"), value: money(Number(issue.facts.cash)), tone: "blue" };
  if (issue.kind === "demand_spike" || issue.impact <= 0) return null;
  return { label: t(lang, "total.risk"), value: money(issue.impact), tone: "red" };
}

export function roleLabel(lang: Lang, user: { role: Role; store?: string }): string {
  return t(lang, `role.${user.role}` as Key, { store: place(lang, user.store ?? "") });
}

export function roleCan(lang: Lang, user: { role: Role; store?: string }): string {
  return t(lang, `role.can.${user.role}` as Key, { store: place(lang, user.store ?? "") });
}

export function Avatar({ user, size }: { user: Pick<SessionUser, "initials" | "role">; size?: "sm" }) {
  return (
    <span className={`avatar ${user.role === "purchasing" ? "" : user.role}${size ? ` ${size}` : ""}`} aria-hidden="true">
      {user.initials}
    </span>
  );
}

export function firstName(name: string): string {
  return name.split(" ")[0] ?? name;
}

/**
 * A translated sentence where some placeholders are React nodes, such as an
 * italic name. Plain values go through t() rules; nodes are dropped in as is.
 */
export function tRich(lang: Lang, key: Key, nodes: Record<string, ReactNode>): ReactNode[] {
  const tpl = (DICTS[lang] ?? en)[key] ?? en[key];
  return tpl.split(/(\{\w+\})/g).map((part, i) => {
    const m = part.match(/^\{(\w+)\}$/);
    return <Fragment key={i}>{m ? nodes[m[1]] ?? "" : part}</Fragment>;
  });
}

/** A number that counts up from its previous value with GSAP. */
export function CountUp({ value, format, delay = 0 }: { value: number; format: (n: number) => string; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  const fmt = useRef(format);
  useLayoutEffect(() => {
    fmt.current = format;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      el.textContent = fmt.current(value);
      prev.current = value;
      return;
    }
    const state = { v: prev.current };
    const tween = gsap.to(state, {
      v: value,
      duration: 1.1,
      delay,
      ease: "power3.out",
      onUpdate: () => {
        el.textContent = fmt.current(Math.round(state.v));
      },
      onComplete: () => {
        prev.current = value;
      },
    });
    return () => {
      prev.current = state.v;
      tween.kill();
    };
  }, [value, delay]);

  return (
    <span ref={ref}>{format(prev.current)}</span>
  );
}
