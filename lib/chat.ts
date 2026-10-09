import { diffDays, formatDate } from "./dates";
import { buildIndex, isOpen, type Index } from "./engine";
import { LOCATIONS } from "./geo";
import { days, DICTS, type Lang, LANGS, localeOf, money, place, t } from "./i18n";
import { issueTitle, issueWhy, optionLabel, partName, pickReason } from "./present";
import type { Analysis, Dataset, Issue, Settings } from "./types";

// The built-in question answerer. It never guesses: every answer is looked up
// or calculated from the records, and anything outside them gets "I do not
// have that in the records".

export type ChatContext = { data: Dataset; analysis: Analysis; settings: Settings; handled: Record<string, unknown> };
export type Intent =
  | { type: "top" }
  | { type: "late" }
  | { type: "stuck" }
  | { type: "why"; location?: string; sku?: string }
  | { type: "suppliers"; sku: string }
  | { type: "free"; text: string };

const WORDS = {
  late: ["late", "overdue", "delay", "लेट", "देर", "ತಡ", "தாமத", "ఆలస్య"],
  stuck: ["slow", "dead stock", "stuck", "tied", "cash", "फँसा", "धीमा", "ಸಿಕ್ಕಿ", "ನಿಧಾನ", "முடங்", "மெதுவ", "నిలిచి", "నెమ్మది"],
  why: ["why", "reason", "क्यों", "ಏಕೆ", "ஏன்", "ఎందుకు"],
  suppliers: ["supplier", "supplies", "vendor", "सप्लायर", "ಪೂರೈ", "சப்ளை", "సప్ల"],
  top: ["attention", "today", "urgent", "priorit", "matter", "ध्यान", "आज", "ಗಮನ", "ಇಂದು", "கவனம்", "இன்று", "దృష్టి", "ఈ రోజు"],
};

const has = (q: string, list: string[]) => list.some((w) => q.includes(w));

function findLocation(q: string, data: Dataset): string | undefined {
  const names = new Set<string>([...LOCATIONS.map((l) => l.name), ...data.inventory.map((r) => r.location)]);
  let best: string | undefined;
  for (const name of names) {
    const forms = [name.toLowerCase(), ...LANGS.map((l) => place(l.code, name).toLowerCase())];
    const first = name.toLowerCase().split(" ")[0];
    if (forms.some((f) => q.includes(f))) return name; // full name wins ("hubli warehouse")
    if (first.length >= 4 && q.includes(first) && !best) best = name;
  }
  return best;
}

function findSku(q: string, data: Dataset): string | undefined {
  let best: { sku: string; score: number } | undefined;
  for (const p of data.products) {
    if (q.includes(p.sku.toLowerCase())) return p.sku;
    const words = p.name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
    const score = words.filter((w) => q.includes(w)).length / Math.max(1, words.length);
    const machine = q.includes(p.machine_model.toLowerCase()) ? 0.2 : 0;
    if (score > 0 && (!best || score + machine > best.score)) best = { sku: p.sku, score: score + machine };
  }
  return best?.sku;
}

function findSupplier(q: string, data: Dataset): string | undefined {
  const names = [...new Set(data.suppliers.map((s) => s.supplier))];
  return names.find((n) => q.includes(n.toLowerCase())) ?? names.find((n) => q.includes(n.toLowerCase().split(" ")[0]) && n.split(" ")[0].length >= 5);
}

function openIssues(ctx: ChatContext): Issue[] {
  return ctx.analysis.issues.filter((i) => !ctx.handled[i.id]);
}

function recommendLine(lang: Lang, issue: Issue): string {
  const rec = issue.options.find((o) => o.id === issue.recommended);
  return rec ? t(lang, "chat.a.recommend", { action: optionLabel(lang, rec, issue) }) : "";
}

function whyAnswer(lang: Lang, issue: Issue, data: Dataset): string {
  return [issueTitle(lang, issue, data) + ".", issueWhy(lang, issue), recommendLine(lang, issue), pickReason(lang, issue)].filter(Boolean).join(" ");
}

function topAnswer(lang: Lang, ctx: ChatContext): string {
  const issues = openIssues(ctx);
  if (!issues.length) return t(lang, "chat.a.none");
  return [
    t(lang, "chat.a.top", { n: issues.length }),
    ...issues.slice(0, 3).map((i, n) => `${n + 1}. ${issueTitle(lang, i, ctx.data)}. ${recommendLine(lang, i)}`),
  ].join("\n");
}

function lateAnswer(lang: Lang, ctx: ChatContext): string {
  const asOf = ctx.analysis.asOf;
  const late = ctx.data.purchase_orders.filter((p) => isOpen(p) && diffDays(p.expected_date, asOf) > 0);
  if (!late.length) return t(lang, "chat.a.nolate");
  return [
    t(lang, "chat.a.late"),
    ...late.map((p) =>
      t(lang, "chat.a.late.line", { po: p.po, supplier: p.supplier, qty: p.qty, part: partName(ctx.data, p.sku), days: days(diffDays(p.expected_date, asOf)) }),
    ),
  ].join("\n");
}

function stuckAnswer(lang: Lang, ctx: ChatContext): string {
  const slow = ctx.analysis.issues.filter((i) => i.kind === "slow_stock");
  if (!slow.length) return t(lang, "chat.a.nostuck");
  const total = slow.reduce((n, i) => n + Number(i.facts.cash), 0);
  return [
    t(lang, "chat.a.stuck", { total: money(total) }),
    ...slow.map((i) =>
      t(lang, "chat.a.stuck.line", { loc: place(lang, i.location), qty: Number(i.facts.excess), part: partName(ctx.data, i.sku), cash: money(Number(i.facts.cash)) }),
    ),
  ].join("\n");
}

function suppliersAnswer(lang: Lang, ix: Index, data: Dataset, sku: string): string {
  const sups = ix.suppliers.get(sku) ?? [];
  if (!sups.length) return t(lang, "chat.a.unknown");
  return [
    t(lang, "chat.a.suppliers", { part: partName(data, sku) }),
    ...sups.map((s) => t(lang, "chat.a.suppliers.line", { supplier: s.supplier, price: money(s.price), lead: days(s.lead_time_days), moq: s.moq })),
  ].join("\n");
}

export function answer(intent: Intent, lang: Lang, ctx: ChatContext): string {
  const { data, analysis, settings } = ctx;
  const ix = buildIndex(data, settings, analysis.asOf);

  if (intent.type === "top") return topAnswer(lang, ctx);
  if (intent.type === "late") return lateAnswer(lang, ctx);
  if (intent.type === "stuck") return stuckAnswer(lang, ctx);
  if (intent.type === "suppliers") return suppliersAnswer(lang, ix, data, intent.sku);
  if (intent.type === "why") {
    const issue = analysis.issues.find((i) => (!intent.location || i.location === intent.location) && (!intent.sku || i.sku === intent.sku));
    return issue ? whyAnswer(lang, issue, data) : t(lang, "chat.a.loc.ok", { loc: place(lang, intent.location ?? "") });
  }

  const q = intent.text.toLowerCase().trim();
  if (!q) return t(lang, "chat.a.unknown");
  const loc = findLocation(q, data);
  const sku = findSku(q, data);
  const supplier = findSupplier(q, data);
  const poId = q.match(/po[-\s]?(\d{2,})/)?.[1];

  if (poId) {
    const po = data.purchase_orders.find((p) => p.po.replace(/\D/g, "") === poId);
    if (po) {
      const issue = analysis.issues.find((i) => i.po === po.po);
      if (issue) return whyAnswer(lang, issue, data);
      const statusKey = (`status.${po.status.toLowerCase()}`) as keyof typeof DICTS.en;
      const status = statusKey in DICTS.en ? t(lang, statusKey) : po.status;
      return `${po.po}: ${po.supplier}, ${po.qty} x ${partName(data, po.sku)}. ${t(lang, "f.expected")}: ${formatDate(po.expected_date, localeOf(lang))}. ${t(lang, "col.status")}: ${status}.`;
    }
  }
  if (has(q, WORDS.why) && (loc || sku)) {
    const issue = analysis.issues.find((i) => (!loc || i.location === loc) && (!sku || i.sku === sku));
    if (issue) return whyAnswer(lang, issue, data);
  }
  if (has(q, WORDS.late)) return lateAnswer(lang, ctx);
  if (has(q, WORDS.stuck)) return stuckAnswer(lang, ctx);
  if (sku && has(q, WORDS.suppliers)) return suppliersAnswer(lang, ix, data, sku);
  if (supplier) {
    const lines = data.suppliers.filter((s) => s.supplier === supplier).slice(0, 8);
    return [
      `${supplier}:`,
      ...lines.map((s) => `${partName(data, s.sku)}: ${t(lang, "chat.a.suppliers.line", { supplier: s.sku, price: money(s.price), lead: days(s.lead_time_days), moq: s.moq })}`),
    ].join("\n");
  }
  if (sku && loc) {
    const p = ix.positions.get(`${sku}|${loc}`);
    if (p) {
      const line = t(lang, "chat.a.position", {
        part: partName(data, sku),
        loc: place(lang, loc),
        stock: p.stock,
        rate: Math.round(p.rate * 10) / 10,
        cover: days(p.rate > 0 ? Math.round(p.cover) : 999),
        incoming: p.incoming,
      });
      const issue = analysis.issues.find((i) => i.sku === sku && i.location === loc);
      return issue ? `${line}\n${issueTitle(lang, issue, data)}. ${recommendLine(lang, issue)}` : line;
    }
  }
  if (sku) {
    const rows = [...ix.positions.values()].filter((p) => p.sku === sku && (p.stock > 0 || p.rate > 0));
    return [
      t(lang, "chat.a.part", { part: partName(data, sku), sku }),
      ...rows.map((p) => t(lang, "chat.a.part.line", { loc: place(lang, p.location), stock: p.stock, rate: Math.round(p.rate * 10) / 10 })),
      suppliersAnswer(lang, ix, data, sku),
    ].join("\n");
  }
  if (loc) {
    const here = openIssues(ctx).filter((i) => i.location === loc);
    if (!here.length) return t(lang, "chat.a.loc.ok", { loc: place(lang, loc) });
    return [
      t(lang, "chat.a.loc", { loc: place(lang, loc), n: here.length }),
      ...here.map((i, n) => `${n + 1}. ${issueTitle(lang, i, data)}. ${recommendLine(lang, i)}`),
    ].join("\n");
  }
  if (has(q, WORDS.top)) return topAnswer(lang, ctx);
  return t(lang, "chat.a.unknown");
}

/** A compact, numbers-only summary handed to the optional language model as its only source of truth. */
export function factsForModel(ctx: ChatContext): string {
  const { data, analysis } = ctx;
  return JSON.stringify({
    as_of: analysis.asOf,
    open_problems: analysis.issues.slice(0, 12).map((i) => ({
      what: issueTitle("en", i, data),
      why: issueWhy("en", i),
      already_decided: Boolean(ctx.handled[i.id]),
      options: i.options.map((o) => ({
        option: optionLabel("en", o, i),
        recommended: o.id === i.recommended,
        arrives_in_days: o.arrivesInDays,
        empty_shelf_days: o.stockoutDays,
        lost_sales_rupees: o.lostMargin,
        extra_cost_rupees: o.freight + o.premium + o.holdingCost + o.writeOff,
        total_cost_rupees: o.totalImpact,
      })),
    })),
    suppliers: data.suppliers,
    purchase_orders: data.purchase_orders,
  });
}
