"use client";

import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { LOCATIONS, type LocationInfo } from "@/lib/geo";
import { type Key, type Lang, place, t } from "@/lib/i18n";
import { issueTitle } from "@/lib/present";
import type { Dataset, Issue } from "@/lib/types";

// Kaveri's eight locations drawn where they really are (equirectangular,
// corrected for latitude), coloured by how urgent their open problems are.
// Brass dashed arcs are transfers the desk is proposing; solid green arcs
// with a moving dot are transfers someone already approved.

type Status = "critical" | "watch" | "ok";

const W = 400;
const PAD_X = 70;
const PAD_Y = 40;

// Which side of the dot each label sits on, so the close pairs (Dharwad and Hubli) never collide.
const LABEL: Record<string, "left" | "right" | "below"> = {
  Gokak: "right",
  Belgaum: "below",
  Dharwad: "left",
  "Hubli Warehouse": "right",
  Gadag: "right",
  Vijayapura: "left",
  Haveri: "right",
  "Bagalkot Warehouse": "left",
};

const lons = LOCATIONS.map((l) => l.lon);
const lats = LOCATIONS.map((l) => l.lat);
const minLon = Math.min(...lons);
const maxLon = Math.max(...lons);
const minLat = Math.min(...lats);
const maxLat = Math.max(...lats);
const KX = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
const SCALE = (W - 2 * PAD_X) / ((maxLon - minLon) * KX);
const H = Math.round((maxLat - minLat) * SCALE + 2 * PAD_Y);

function project(l: LocationInfo): [number, number] {
  return [PAD_X + (l.lon - minLon) * KX * SCALE, PAD_Y + (maxLat - l.lat) * SCALE];
}

const POS = new Map(LOCATIONS.map((l) => [l.name, project(l)]));
const WAREHOUSE_WORD = /Warehouse|गोदाम|ಗೋದಾಮು|கிடங்கு|గోదాం/u;

function arc(from: string, to: string): string | null {
  const a = POS.get(from);
  const b = POS.get(to);
  if (!a || !b) return null;
  const [x1, y1] = a;
  const [x2, y2] = b;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const bend = 0.22;
  return `M${x1.toFixed(1)},${y1.toFixed(1)} Q${(mx - dy * bend).toFixed(1)},${(my + dx * bend).toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
}

// Faint supply lanes: each store to its nearest warehouse.
const LANES = (() => {
  const whs = LOCATIONS.filter((l) => l.kind === "warehouse");
  return LOCATIONS.filter((l) => l.kind === "store").map((s) => {
    const [sx, sy] = project(s);
    const near = whs
      .map((w) => ({ w, d: Math.hypot(project(w)[0] - sx, project(w)[1] - sy) }))
      .sort((a, b) => a.d - b.d)[0].w;
    const [wx, wy] = project(near);
    return `M${sx.toFixed(1)},${sy.toFixed(1)} L${wx.toFixed(1)},${wy.toFixed(1)}`;
  });
})();

const DOTS = (() => {
  const out: [number, number][] = [];
  for (let x = 14; x < W; x += 22) for (let y = 14; y < H; y += 22) out.push([x, y]);
  return out;
})();

type Props = {
  lang: Lang;
  issues: Issue[];
  data: Dataset;
  active?: string | null;
  onPick?: (location: string) => void;
  title: string;
  /** Purely visual (the sign-in screen): no focus stops, no tooltips. */
  decorative?: boolean;
};

export default function NetworkMap({ lang, issues, data, active, onPick, title, decorative }: Props) {
  const [hover, setHover] = useState<string | null>(null);

  const status = useMemo(() => {
    const m = new Map<string, Status>();
    for (const l of LOCATIONS) {
      const here = issues.filter((i) => i.location === l.name);
      const urgent = here.some((i) => (i.kind === "stockout" || i.kind === "overdue_po") && i.urgencyDays <= 3);
      m.set(l.name, urgent ? "critical" : here.length ? "watch" : "ok");
    }
    return m;
  }, [issues]);

  const proposed = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; d: string }[] = [];
    for (const i of issues) {
      const rec = i.options.find((o) => o.id === i.recommended);
      for (const a of rec?.actions ?? []) {
        if (a.type !== "transfer") continue;
        const id = `${a.from}>${a.to}`;
        const d = arc(a.from, a.to);
        if (d && !seen.has(id)) {
          seen.add(id);
          out.push({ id, d });
        }
      }
    }
    return out;
  }, [issues]);

  const transit = useMemo(
    () =>
      data.transfers
        .map((tr) => ({ id: tr.id, d: arc(tr.from, tr.to) }))
        .filter((x): x is { id: string; d: string } => Boolean(x.d)),
    [data.transfers],
  );

  const tip = hover ? LOCATIONS.find((l) => l.name === hover) : undefined;
  const tipIssues = tip ? issues.filter((i) => i.location === tip.name) : [];
  const tipPos = tip ? POS.get(tip.name) : undefined;
  const statusKey = (s: Status): Key => (s === "critical" ? "map.critical" : s === "watch" ? "map.watch" : "map.ok");

  return (
    <div className="netmap">
      <svg viewBox={`0 0 ${W} ${H}`} role={decorative ? undefined : "group"} aria-label={decorative ? undefined : title} aria-hidden={decorative || undefined}>
        <g className="net-grid" aria-hidden="true">
          {DOTS.map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={1} />
          ))}
        </g>
        <g aria-hidden="true">
          {LANES.map((d) => (
            <path key={d} className="net-lane" d={d} />
          ))}
        </g>
        <g aria-hidden="true">
          {proposed.map((p, i) => (
            <motion.path
              key={p.id}
              className="net-move"
              d={p.d}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 + i * 0.12, duration: 0.6 }}
            />
          ))}
          {transit.map((p) => (
            <g key={p.id}>
              <path className="net-move transit" d={p.d} />
              <circle r={4} fill="var(--accent)">
                <animateMotion dur="2.8s" repeatCount="indefinite" path={p.d} />
              </circle>
            </g>
          ))}
        </g>
        {LOCATIONS.map((l, i) => {
          const [x, y] = project(l);
          const s = status.get(l.name) ?? "ok";
          const side = LABEL[l.name] ?? "right";
          const wh = l.kind === "warehouse";
          // Warehouses show the town on one line and the word "warehouse" on the next.
          const shortName = wh ? place(lang, l.name).replace(WAREHOUSE_WORD, "").trim() : place(lang, l.name);
          const tx = side === "left" ? x - 13 : side === "right" ? x + 13 : x;
          const ty = side === "below" ? y + 24 : y + 4;
          const anchor = side === "left" ? "end" : side === "right" ? "start" : "middle";
          const count = issues.filter((it) => it.location === l.name).length;
          const label = `${place(lang, l.name)}: ${t(lang, statusKey(s))}. ${count ? t(lang, "map.count", { n: count }) : t(lang, "map.none")}`;
          return (
            <motion.g
              key={l.name}
              className={`net-node n-${s}${wh ? " wh" : ""}${active === l.name ? " active" : ""}`}
              role={decorative ? undefined : "button"}
              tabIndex={decorative ? undefined : 0}
              aria-label={decorative ? undefined : label}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.06, duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
              onMouseEnter={() => !decorative && setHover(l.name)}
              onMouseLeave={() => setHover((h) => (h === l.name ? null : h))}
              onFocus={() => !decorative && setHover(l.name)}
              onBlur={() => setHover((h) => (h === l.name ? null : h))}
              onClick={() => onPick?.(l.name)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onPick?.(l.name);
                }
              }}
            >
              <circle className="halo" cx={x} cy={y} r={18} />
              {s === "critical" && <circle className="ring" cx={x} cy={y} r={9} />}
              {wh ? (
                <rect className="core" x={x - 7} y={y - 7} width={14} height={14} rx={3} />
              ) : (
                <circle className="core" cx={x} cy={y} r={7} />
              )}
              <text x={tx} y={ty} textAnchor={anchor}>
                {shortName}
              </text>
              {wh && (
                <text className="sub" x={tx} y={ty + 13} textAnchor={anchor}>
                  {t(lang, "map.warehouse")}
                </text>
              )}
            </motion.g>
          );
        })}
      </svg>
      {tip && tipPos && (
        <div className="net-tip" style={{ left: `${(tipPos[0] / W) * 100}%`, top: `${(tipPos[1] / H) * 100}%` }} aria-hidden="true">
          <b>{place(lang, tip.name)}</b>
          <span>
            {t(lang, statusKey(status.get(tip.name) ?? "ok"))} · {tipIssues.length ? t(lang, "map.count", { n: tipIssues.length }) : t(lang, "map.none")}
          </span>
          {tipIssues[0] && <div style={{ marginTop: 6 }}>{issueTitle(lang, tipIssues[0], data)}</div>}
        </div>
      )}
    </div>
  );
}
