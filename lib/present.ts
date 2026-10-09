import { formatDate } from "./dates";
import { locationInfo, supplierLang } from "./geo";
import { days, isLang, type Key, type Lang, localeOf, money, place, t, type Vars } from "./i18n";
import type { ActionDraft, Dataset, Issue, Note, Option } from "./types";

// Turns the engine's numbers and reason codes into sentences, in any of the
// five languages. The engine never writes prose, so the wording can change
// without touching a single calculation.

export function partName(data: Dataset, sku: string): string {
  return data.products.find((p) => p.sku === sku)?.name ?? sku;
}

const DURATION = new Set(["days", "cover", "lead", "fastLead", "cheapLead"]);
const MONEY = new Set(["cash", "perUnit"]);
const PLACE = new Set(["from", "to"]);

export function noteText(lang: Lang, note: Note): string {
  const vars: Vars = {};
  for (const [k, v] of Object.entries(note.v ?? {})) {
    if (DURATION.has(k) && typeof v === "number") vars[k] = days(v);
    else if (MONEY.has(k) && typeof v === "number") vars[k] = money(v);
    else if (PLACE.has(k) && typeof v === "string") vars[k] = place(lang, v);
    else vars[k] = v;
  }
  return t(lang, `note.${note.code}` as Key, vars);
}

export function kindKey(issue: Issue): Key {
  if (issue.kind === "stockout" && issue.facts.routine === 1) return "kind.reorder";
  return `kind.${issue.kind}` as Key;
}

export function issueTitle(lang: Lang, issue: Issue, data: Dataset): string {
  const f = issue.facts;
  const part = partName(data, issue.sku);
  const loc = place(lang, issue.location);
  switch (issue.kind) {
    case "stockout": {
      if (f.routine === 1) return t(lang, "title.reorder", { part, loc });
      const d = Math.round(Number(f.cover));
      return d < 1 ? t(lang, "title.stockout.today", { part, loc }) : t(lang, "title.stockout", { part, loc, days: days(d) });
    }
    case "overdue_po":
      return t(lang, "title.overdue_po", { po: issue.po ?? "", supplier: issue.supplier ?? "", days: days(Number(f.daysLate)) });
    case "slow_stock":
      return t(lang, "title.slow_stock", { loc, qty: Number(f.stock), part });
    case "supplier_fit":
      return t(lang, "title.supplier_fit", { po: issue.po ?? "", days: days(Number(f.days)), part });
    case "demand_spike":
      return t(lang, "title.demand_spike", { part, loc, times: Number(f.times) > 20 ? "20+" : Number(f.times) });
    case "demand_drop":
      return t(lang, "title.demand_drop", { part, loc, pct: Number(f.pct) });
  }
}

export function issueWhy(lang: Lang, issue: Issue): string {
  const f = issue.facts;
  const loc = place(lang, issue.location);
  const n = (k: string) => Number(f[k]);
  switch (issue.kind) {
    case "stockout": {
      const v: Vars = { loc, stock: n("stock"), rate: n("rate"), cover: days(n("cover")), supplier: String(f.usualSupplier), lead: days(n("usualLead")) };
      if (!f.usualSupplier) return t(lang, "why.stockout.nosup", v);
      return t(lang, f.routine === 1 ? "why.reorder" : "why.stockout", v);
    }
    case "overdue_po": {
      const v: Vars = { po: issue.po ?? "", qty: n("qty"), days: days(n("daysLate")), loc, stock: n("stock"), rate: n("rate"), cover: days(Math.max(0, n("cover"))) };
      if (f.network === 1 && n("cover") >= 0) return t(lang, "why.overdue_po.network", v);
      if (f.atRisk !== 1 || n("cover") < 0) return t(lang, "why.overdue_po.safe", v);
      return t(lang, "why.overdue_po", v);
    }
    case "slow_stock": {
      const v: Vars = { loc, stock: n("stock"), sold: n("sold28"), cover: days(n("cover")), cash: money(n("cash")) };
      return t(lang, n("sold28") === 0 || n("cover") < 0 ? "why.slow_stock.dead" : "why.slow_stock", v);
    }
    case "supplier_fit":
      return t(lang, "why.supplier_fit", {
        supplier: issue.supplier ?? "",
        moq: n("moq"),
        po: issue.po ?? "",
        qty: n("qty"),
        rate: n("rate"),
        days: days(n("days")),
        cash: money(n("cash")),
        alt: String(f.alt),
        altMoq: n("altMoq"),
      });
    case "demand_spike":
      return t(lang, "why.demand_spike", { loc, from: n("from"), to: n("to"), stock: n("stock"), cover: days(n("cover")) });
    case "demand_drop":
      return t(lang, "why.demand_drop", { loc, from: n("from"), to: n("to"), stock: n("stock"), incoming: n("incoming"), surplus: n("surplus"), cash: money(n("cash")) });
  }
}

export function optionLabel(lang: Lang, o: Option, issue: Issue): string {
  const tr = o.actions.find((a) => a.type === "transfer");
  const md = o.actions.find((a) => a.type === "alert" && a.purpose === "markdown");
  const vars: Vars = {
    qty: o.qty,
    tq: o.transferQty,
    supplier: o.supplier ?? "",
    supplier2: o.supplier2 ?? "",
    from: place(lang, o.from ?? ""),
    pct: md && md.type === "alert" ? md.pct ?? 0 : 0,
  };
  if (o.type === "transfer" && tr && tr.type === "transfer") {
    if (tr.from === issue.location) return t(lang, "opt.transfer_out", { qty: tr.qty, to: place(lang, tr.to) });
    return t(lang, "opt.transfer_in", { qty: tr.qty, from: place(lang, tr.from) });
  }
  return t(lang, `opt.${o.type}` as Key, vars);
}

/** One sentence on why the recommended option beat the rest. */
export function pickReason(lang: Lang, issue: Issue, rejected: string[] = []): string {
  const rec = issue.options.find((o) => o.id === issue.recommended);
  if (!rec) return t(lang, "pick.none");
  const rest = issue.options
    .filter((o) => o.id !== rec.id && !rejected.includes(o.id))
    .sort((a, b) => a.totalImpact - b.totalImpact);
  if (!rest.length) return t(lang, "pick.why.only");
  if (rest[0].totalImpact > rec.totalImpact) return t(lang, "pick.why.cost", { a: money(rec.totalImpact), b: money(rest[0].totalImpact) });
  return t(lang, "pick.why.tie");
}

export function actionTitleKey(a: ActionDraft): Key {
  return `draft.${a.type}` as Key;
}

/** Who the message goes to, and the language that person works in. */
export function recipient(a: ActionDraft): { name: string; isSupplier: boolean; lang: Lang } {
  if (a.type === "po" || a.type === "enquiry") {
    const l = supplierLang(a.supplier);
    return { name: a.supplier, isSupplier: true, lang: isLang(l) ? l : "en" };
  }
  const where = a.type === "transfer" ? a.from : a.location;
  const l = locationInfo(where)?.lang ?? "en";
  return { name: where, isSupplier: false, lang: isLang(l) ? l : "en" };
}

/** The message a person would actually send, written in the recipient's language and signed by the sender. */
export function actionMessage(lang: Lang, a: ActionDraft, data: Dataset, signer?: string): string {
  const part = partName(data, a.sku);
  const locale = localeOf(lang);
  const r = recipient(a);
  const who = r.isSupplier ? r.name : t(lang, "m.team", { loc: place(lang, r.name) });
  let body = "";
  if (a.type === "po") {
    body = t(lang, "m.po", { po: a.po, qty: a.qty, part, sku: a.sku, price: money(a.price), total: money(a.total), loc: place(lang, a.location), date: formatDate(a.expected_date, locale) });
  } else if (a.type === "transfer") {
    body = t(lang, "m.transfer", { qty: a.qty, part, sku: a.sku, to: place(lang, a.to), id: a.id, date: formatDate(a.eta, locale) });
  } else if (a.type === "enquiry") {
    body =
      a.purpose === "chase"
        ? t(lang, "m.chase", { po: a.po, qty: a.qty, part, days: days(a.daysLate ?? 0) })
        : t(lang, "m.reduce", { po: a.po, qty: a.qty, part });
  } else {
    const key: Key = a.purpose === "markdown" ? "m.markdown" : a.purpose === "confirm_spike" ? "m.confirm_spike" : "m.confirm_drop";
    body = t(lang, key, { qty: a.qty ?? 0, part, sku: a.sku, pct: a.pct ?? 0, from: a.from ?? 0, to: a.to ?? 0 });
  }
  return `${t(lang, "m.greet", { who })} ${body}\n${t(lang, "m.sign", { name: signer || t(lang, "app.name") })}`;
}

export function actionDone(lang: Lang, a: ActionDraft): string {
  if (a.type === "po") return t(lang, "act.po.done", { po: a.po, supplier: a.supplier, qty: a.qty });
  if (a.type === "transfer") return t(lang, "act.transfer.done", { qty: a.qty, from: place(lang, a.from), to: place(lang, a.to) });
  if (a.type === "enquiry") return t(lang, "act.enquiry.done", { supplier: a.supplier });
  return t(lang, "act.alert.done", { loc: place(lang, a.location) });
}
