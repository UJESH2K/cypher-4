import { addDays, diffDays, isIsoDate } from "./dates";
import { isWarehouse, MAIN_WAREHOUSE, roadKm, transferDays } from "./geo";
import type {
  ActionDraft,
  Analysis,
  Dataset,
  Issue,
  Note,
  Option,
  PurchaseOrder,
  Settings,
  SupplierRow,
} from "./types";

// The agent's reasoning. Everything here is plain arithmetic on the five
// record types, so each recommendation can be traced back to its numbers.
//
//   observe  -> buildIndex()     read and join the records
//   reason   -> position()       demand rate, days of cover, what is inbound
//   evaluate -> the option builders, each run through simulate()
//   decide   -> pickBest()       lowest total rupee impact wins
//   act      -> ActionDraft      a PO, transfer, enquiry or alert, never executed here
//   explain  -> facts + notes    reason codes with their numbers

const WINDOW = 28;
const RECENT = 7;

type Arrival = { day: number; qty: number; ref: string };

export type Position = {
  sku: string;
  location: string;
  stock: number;
  series: number[];
  r7: number;
  rPrev: number;
  rate: number;
  ratio: number;
  spike: boolean;
  drop: boolean;
  arrivals: Arrival[];
  incoming: number;
  overdue: PurchaseOrder[];
  cover: number; // days the stock on the shelf lasts, ignoring arrivals
};

export type Index = {
  asOf: string;
  data: Dataset;
  settings: Settings;
  locations: string[];
  skus: string[];
  suppliers: Map<string, SupplierRow[]>; // per sku, cheapest first
  positions: Map<string, Position>;
  networkRate: Map<string, number>;
  historyDays: number;
};

const key = (sku: string, loc: string) => `${sku}|${loc}`;
const round = (n: number) => Math.round(n);
const round1 = (n: number) => Math.round(n * 10) / 10;

export function poLocation(po: PurchaseOrder): string {
  return po.location && po.location.trim() ? po.location : MAIN_WAREHOUSE;
}

export function isOpen(po: PurchaseOrder): boolean {
  return (po.status || "").trim().toLowerCase() === "open";
}

export function resolveAsOf(data: Dataset, fallback: string): string {
  let latest = "";
  for (const s of data.sales) if (isIsoDate(s.date) && s.date > latest) latest = s.date;
  return latest ? addDays(latest, 1) : fallback;
}

export function buildIndex(data: Dataset, settings: Settings, asOf: string): Index {
  const locSet = new Set<string>();
  const skuSet = new Set<string>();
  for (const p of data.products) skuSet.add(p.sku);
  for (const r of data.inventory) {
    locSet.add(r.location);
    skuSet.add(r.sku);
  }
  for (const s of data.sales) locSet.add(s.location);

  const suppliers = new Map<string, SupplierRow[]>();
  for (const s of data.suppliers) {
    if (!(s.price > 0)) continue;
    const list = suppliers.get(s.sku) ?? [];
    list.push({ ...s, lead_time_days: Math.max(0, s.lead_time_days || 0), moq: Math.max(1, s.moq || 1) });
    suppliers.set(s.sku, list);
  }
  for (const list of suppliers.values()) list.sort((a, b) => a.price - b.price || a.lead_time_days - b.lead_time_days);

  let earliest = "";
  const series = new Map<string, number[]>();
  for (const s of data.sales) {
    if (!isIsoDate(s.date)) continue;
    if (!earliest || s.date < earliest) earliest = s.date;
    const back = diffDays(s.date, asOf); // 1 = yesterday
    if (back < 1 || back > WINDOW) continue;
    const k = key(s.sku, s.location);
    let arr = series.get(k);
    if (!arr) {
      arr = new Array(WINDOW).fill(0);
      series.set(k, arr);
    }
    arr[WINDOW - back] += Number(s.qty_sold) || 0;
  }
  const historyDays = earliest ? Math.max(1, Math.min(WINDOW, diffDays(earliest, asOf))) : 0;

  const stock = new Map<string, number>();
  for (const r of data.inventory) stock.set(key(r.sku, r.location), (stock.get(key(r.sku, r.location)) ?? 0) + (Number(r.stock) || 0));

  const positions = new Map<string, Position>();
  const networkRate = new Map<string, number>();
  const pairs = new Set<string>([...stock.keys(), ...series.keys()]);
  for (const k of pairs) {
    const [sku, location] = k.split("|");
    const ser = series.get(k) ?? new Array(WINDOW).fill(0);
    const recentDays = Math.min(RECENT, Math.max(1, historyDays));
    const prevDays = Math.max(0, historyDays - RECENT);
    const sumRecent = ser.slice(WINDOW - recentDays).reduce((a, b) => a + b, 0);
    const sumPrev = prevDays ? ser.slice(WINDOW - recentDays - prevDays, WINDOW - recentDays).reduce((a, b) => a + b, 0) : 0;
    const r7 = sumRecent / recentDays;
    const rPrev = prevDays >= 7 ? sumPrev / prevDays : r7;
    const ratio = rPrev > 0 ? r7 / rPrev : r7 > 0 ? 99 : 1;
    // A shift only counts when it is large in proportion AND more than chance.
    // Daily sales of a spare part are roughly Poisson, so a week's total wobbles
    // by about the square root of what is expected; we ask for well beyond that.
    const expected = rPrev * recentDays;
    const z = expected > 0 ? (sumRecent - expected) / Math.sqrt(expected) : sumRecent >= 8 ? 99 : 0;
    const spike = prevDays >= 7 && ratio >= 1.8 && z >= 4 && sumRecent - expected >= 6;
    const drop = prevDays >= 7 && ratio <= 0.45 && z <= -3.5 && expected - sumRecent >= 6;
    const rate = spike || drop ? r7 : 0.6 * r7 + 0.4 * rPrev;

    const arrivals: Arrival[] = [];
    const overdue: PurchaseOrder[] = [];
    for (const po of data.purchase_orders) {
      if (!isOpen(po) || po.sku !== sku || poLocation(po) !== location) continue;
      const day = isIsoDate(po.expected_date) ? diffDays(asOf, po.expected_date) : -1;
      if (day < 0) overdue.push(po);
      else arrivals.push({ day, qty: Number(po.qty) || 0, ref: po.po });
    }
    for (const t of data.transfers) {
      if (t.sku !== sku || t.to !== location) continue;
      arrivals.push({ day: Math.max(0, diffDays(asOf, t.eta)), qty: t.qty, ref: t.id });
    }
    const st = Math.max(0, stock.get(k) ?? 0);
    positions.set(k, {
      sku,
      location,
      stock: st,
      series: ser,
      r7,
      rPrev,
      rate,
      ratio,
      spike,
      drop,
      arrivals,
      incoming: arrivals.reduce((a, b) => a + b.qty, 0),
      overdue,
      cover: rate > 0 ? st / rate : Infinity,
    });
    if (!isWarehouse(location)) networkRate.set(sku, (networkRate.get(sku) ?? 0) + rate);
  }

  return {
    asOf,
    data,
    settings,
    locations: [...locSet],
    skus: [...skuSet],
    suppliers,
    positions,
    networkRate,
    historyDays,
  };
}

/**
 * Walk forward one day at a time. Goods that arrive after d days are on the
 * shelf from day d+1. Returns what would be lost to an empty shelf.
 */
export function simulate(stock: number, rate: number, arrivals: { day: number; qty: number }[], horizon: number) {
  let s = stock;
  let lostUnits = 0;
  let stockoutDays = 0;
  let runoutIn = Infinity;
  for (let t = 1; t <= horizon; t++) {
    for (const a of arrivals) if (a.day === t - 1) s += a.qty;
    const sold = Math.min(s, rate);
    const lost = rate - sold;
    if (lost > 1e-9) {
      lostUnits += lost;
      stockoutDays += lost / rate;
      if (runoutIn === Infinity) runoutIn = t - 1 + sold / rate;
    }
    s -= sold;
  }
  return { lostUnits, stockoutDays, runoutIn, endStock: s };
}

type Ctx = {
  ix: Index;
  pos: Position;
  sups: SupplierRow[];
  cheapest: SupplierRow | undefined;
  margin: number; // rupees earned per unit sold
  horizon: number;
  ids: IdGen;
};

class IdGen {
  private po: number;
  private tr: number;
  constructor(data: Dataset) {
    this.po = Math.max(1000, ...data.purchase_orders.map((p) => parseInt(String(p.po).replace(/\D/g, ""), 10) || 0));
    this.tr = Math.max(100, ...data.transfers.map((t) => parseInt(t.id.replace(/\D/g, ""), 10) || 0));
  }
  nextPo() {
    return `PO-${++this.po}`;
  }
  nextTr() {
    return `TR-${++this.tr}`;
  }
}

function holding(units: number, price: number, rate: number, settings: Settings): number {
  if (units <= 0) return 0;
  const days = rate > 0 ? Math.min(730, units / rate) : 730;
  // Stock sells down steadily, so on average half of it sits for the whole period.
  return (units * price * (settings.holdingPctYear / 100) * days) / 365 / 2;
}

function freightCost(km: number, s: Settings): number {
  return Math.max(s.freightMin, km * s.freightPerKm);
}

function blank(id: string, type: Option["type"]): Option {
  return {
    id,
    type,
    qty: 0,
    transferQty: 0,
    arrivesInDays: null,
    stockoutDays: 0,
    lostUnits: 0,
    lostMargin: 0,
    freight: 0,
    premium: 0,
    holdingCost: 0,
    writeOff: 0,
    cashOut: 0,
    totalImpact: 0,
    notes: [],
    actions: [],
  };
}

function finish(o: Option, c: Ctx, extraArrivals: { day: number; qty: number }[]): Option {
  const sim = simulate(c.pos.stock, c.pos.rate, [...c.pos.arrivals, ...extraArrivals], c.horizon);
  o.lostUnits = round1(sim.lostUnits);
  o.stockoutDays = round1(sim.stockoutDays);
  o.lostMargin = round(sim.lostUnits * c.margin * c.ix.settings.lostSaleFactor);
  o.freight = round(o.freight);
  o.premium = round(o.premium);
  o.holdingCost = round(o.holdingCost);
  o.writeOff = round(o.writeOff);
  o.cashOut = round(o.cashOut);
  o.totalImpact = o.lostMargin + o.freight + o.premium + o.holdingCost + o.writeOff;
  return o;
}

function poDraft(c: Ctx, s: SupplierRow, qty: number, location: string): ActionDraft {
  return {
    type: "po",
    po: c.ids.nextPo(),
    supplier: s.supplier,
    sku: s.sku,
    qty,
    price: s.price,
    total: qty * s.price,
    location,
    leadDays: s.lead_time_days,
    expected_date: addDays(c.ix.asOf, s.lead_time_days),
  };
}

type Donor = { location: string; surplus: number; days: number; km: number; keep: number };

function donorsFor(ix: Index, sku: string, to: string, shortPairs: Set<string>): Donor[] {
  const out: Donor[] = [];
  for (const p of ix.positions.values()) {
    if (p.sku !== sku || p.location === to || p.stock <= 0) continue;
    if (shortPairs.has(key(p.sku, p.location))) continue; // never borrow from a shelf that is itself short
    const keep = isWarehouse(p.location) ? 0 : Math.ceil(p.rate * ix.settings.donorKeepDays);
    const surplus = Math.floor(p.stock - keep);
    if (surplus <= 0) continue;
    out.push({ location: p.location, surplus, days: transferDays(p.location, to), km: roadKm(p.location, to), keep });
  }
  return out.sort((a, b) => a.days - b.days || a.km - b.km);
}

function pickDonor(donors: Donor[], need: number): Donor | undefined {
  return donors.find((d) => d.surplus >= need) ?? [...donors].sort((a, b) => b.surplus - a.surplus)[0];
}

function transferDraft(c: Ctx, d: Donor, qty: number): ActionDraft {
  return {
    type: "transfer",
    id: c.ids.nextTr(),
    sku: c.pos.sku,
    from: d.location,
    to: c.pos.location,
    qty,
    days: d.days,
    eta: addDays(c.ix.asOf, d.days),
    freight: round(freightCost(d.km, c.ix.settings)),
    km: d.km,
  };
}

function supplierNotes(c: Ctx, s: SupplierRow, qty: number, need: number, runout: number): Note[] {
  const notes: Note[] = [];
  if (s.lead_time_days > runout)
    notes.push({ code: "too_slow", v: { supplier: s.supplier, lead: s.lead_time_days, cover: round1(runout) } });
  if (qty > need && s.moq > need)
    notes.push({
      code: "moq_excess",
      v: { supplier: s.supplier, moq: s.moq, need, days: c.pos.rate > 0 ? round(qty / c.pos.rate) : 0 },
    });
  if (c.cheapest && s.price > c.cheapest.price)
    notes.push({
      code: "costs_more",
      v: { supplier: s.supplier, perUnit: round(s.price - c.cheapest.price), pct: round(((s.price - c.cheapest.price) / c.cheapest.price) * 100) },
    });
  return notes;
}

/** Options for a shelf that is about to run dry. */
function shortageOptions(c: Ctx, donors: Donor[], runout: number): Option[] {
  const { pos, sups, cheapest, ix } = c;
  const s = ix.settings;
  const opts: Option[] = [];
  const target = (lead: number) => Math.max(0, Math.ceil(pos.rate * (lead + s.coverDays) - pos.stock - pos.incoming));

  // Buy from each supplier on its own.
  for (const sup of sups) {
    const need = Math.max(1, target(sup.lead_time_days));
    const qty = Math.max(sup.moq, need);
    const o = blank(`po:${sup.supplier}`, "po");
    o.supplier = sup.supplier;
    o.qty = qty;
    o.arrivesInDays = sup.lead_time_days;
    o.premium = cheapest ? (sup.price - cheapest.price) * qty : 0;
    o.holdingCost = holding(qty - need, sup.price, pos.rate, s);
    o.cashOut = qty * sup.price;
    o.notes = supplierNotes(c, sup, qty, need, runout);
    o.actions = [poDraft(c, sup, qty, pos.location)];
    opts.push(finish(o, c, [{ day: sup.lead_time_days, qty }]));
  }

  // Move stock that is sitting idle somewhere else. Try the nearest shelf, the
  // nearest one that can cover everything, and the biggest pile; keep the best of each kind.
  const want = Math.max(1, Math.ceil(pos.rate * s.coverDays - pos.stock - pos.incoming));
  const candidates = new Map<string, Donor>();
  for (const d of [donors[0], donors.find((d) => d.surplus >= want), [...donors].sort((x, y) => y.surplus - x.surplus)[0]])
    if (d) candidates.set(d.location, d);
  const moves: Option[] = [];
  const combos: Option[] = [];
  for (const donor of candidates.values()) {
    const qty = Math.min(donor.surplus, want);
    const o = blank(`transfer:${donor.location}`, "transfer");
    o.from = donor.location;
    o.transferQty = qty;
    o.arrivesInDays = donor.days;
    o.freight = freightCost(donor.km, s);
    o.notes = [{ code: donor.keep ? "donor_spare" : "donor_spare_wh", v: { from: donor.location, surplus: donor.surplus, keep: donor.keep, days: s.donorKeepDays } }];
    if (donor.days > runout) o.notes.push({ code: "gap_before_arrival", v: { days: donor.days, cover: round1(runout) } });
    if (donor.surplus < want) o.notes.push({ code: "not_enough_alone", v: { qty, want } });
    o.actions = [transferDraft(c, donor, qty)];
    moves.push(finish(o, c, [{ day: donor.days, qty }]));

    // The other shelf cannot cover the full need: borrow enough to bridge, buy the rest at the best price.
    if (cheapest && donor.surplus < want) {
      const needPo = Math.max(1, target(cheapest.lead_time_days) - qty);
      const poQty = Math.max(cheapest.moq, needPo);
      const o2 = blank(`transfer_po:${donor.location}:${cheapest.supplier}`, "transfer_po");
      o2.from = donor.location;
      o2.supplier = cheapest.supplier;
      o2.transferQty = qty;
      o2.qty = poQty;
      o2.arrivesInDays = donor.days;
      o2.freight = freightCost(donor.km, s);
      o2.holdingCost = holding(poQty - needPo, cheapest.price, pos.rate, s);
      o2.cashOut = poQty * cheapest.price;
      o2.notes = [
        { code: "donor_partial", v: { from: donor.location, qty, days: donor.days } },
        { code: "rest_at_best_price", v: { supplier: cheapest.supplier, lead: cheapest.lead_time_days, qty: poQty } },
      ];
      o2.actions = [transferDraft(c, donor, qty), poDraft(c, cheapest, poQty, pos.location)];
      combos.push(
        finish(o2, c, [
          { day: donor.days, qty },
          { day: cheapest.lead_time_days, qty: poQty },
        ]),
      );
    }
  }
  const byImpact = (x: Option, y: Option) => x.totalImpact - y.totalImpact || x.stockoutDays - y.stockoutDays;
  if (moves.length) opts.push(moves.sort(byImpact)[0]);
  if (combos.length) opts.push(combos.sort(byImpact)[0]);

  // A small urgent order from the fastest supplier, and the bulk from the cheapest.
  const fastest = [...sups].sort((a, b) => a.lead_time_days - b.lead_time_days || a.price - b.price)[0];
  if (cheapest && fastest && fastest.supplier !== cheapest.supplier && fastest.lead_time_days < cheapest.lead_time_days && cheapest.lead_time_days > runout) {
    const leftAtFast = Math.max(0, pos.stock - pos.rate * fastest.lead_time_days);
    const bridge = Math.ceil(pos.rate * (cheapest.lead_time_days - fastest.lead_time_days + 1) - leftAtFast);
    const qFast = Math.max(fastest.moq, bridge);
    const needCheap = Math.max(1, target(cheapest.lead_time_days) - qFast);
    const qCheap = Math.max(cheapest.moq, needCheap);
    if (bridge > 0) {
      const o = blank(`split_po:${fastest.supplier}:${cheapest.supplier}`, "split_po");
      o.supplier = fastest.supplier;
      o.supplier2 = cheapest.supplier;
      o.qty = qFast + qCheap;
      o.arrivesInDays = fastest.lead_time_days;
      o.premium = (fastest.price - cheapest.price) * qFast;
      o.holdingCost = holding(qCheap - needCheap, cheapest.price, pos.rate, s);
      o.cashOut = qFast * fastest.price + qCheap * cheapest.price;
      o.notes = [
        { code: "split_logic", v: { fast: fastest.supplier, qFast, fastLead: fastest.lead_time_days, cheap: cheapest.supplier, qCheap, cheapLead: cheapest.lead_time_days } },
        { code: "premium_only_on", v: { qFast, perUnit: round(fastest.price - cheapest.price) } },
      ];
      o.actions = [poDraft(c, fastest, qFast, pos.location), poDraft(c, cheapest, qCheap, pos.location)];
      opts.push(
        finish(o, c, [
          { day: fastest.lead_time_days, qty: qFast },
          { day: cheapest.lead_time_days, qty: qCheap },
        ]),
      );
    }
  }
  return opts;
}

const SIMPLICITY: Record<string, number> = {
  ask_store: 0,
  chase: 0,
  hold: 1,
  keep_po: 1,
  wait: 1,
  transfer: 2,
  po: 3,
  chase_transfer: 4,
  transfer_po: 5,
  split_po: 5,
  chase_po: 5,
  switch_supplier: 5,
  markdown: 6,
};

/** Lowest total rupee impact wins; ties go to fewer empty-shelf days, then the simpler move. */
export function pickBest(options: Option[], rejected: string[] = []): string {
  const live = options.filter((o) => !rejected.includes(o.id));
  if (!live.length) return "";
  return [...live].sort(
    (a, b) =>
      a.totalImpact - b.totalImpact ||
      a.stockoutDays - b.stockoutDays ||
      SIMPLICITY[a.type] - SIMPLICITY[b.type] ||
      a.cashOut - b.cashOut,
  )[0].id;
}

function urgencyFactor(days: number): number {
  if (days <= 2) return 3;
  if (days <= 5) return 2;
  if (days <= 10) return 1.5;
  return 1;
}

export function analyse(
  data: Dataset,
  settings: Settings,
  today: string,
  rejected: Record<string, string[]> = {},
): Analysis {
  const asOf = resolveAsOf(data, today);
  const ix = buildIndex(data, settings, asOf);
  const ids = new IdGen(data);
  const issues: Issue[] = [];
  const maxLead = (sku: string) => Math.max(7, ...(ix.suppliers.get(sku) ?? []).map((s) => s.lead_time_days));

  const mkCtx = (pos: Position): Ctx => {
    const sups = ix.suppliers.get(pos.sku) ?? [];
    const cheapest = sups[0];
    return {
      ix,
      pos,
      sups,
      cheapest,
      margin: cheapest ? (cheapest.price * settings.marginPct) / 100 : 0,
      horizon: maxLead(pos.sku) + 7,
      ids,
    };
  };

  // Pass 1: which shelves are short? (Needed first so nobody borrows from them.)
  const shortPairs = new Set<string>();
  const runouts = new Map<string, number>();
  for (const pos of ix.positions.values()) {
    if (pos.rate <= 0) continue;
    const c = mkCtx(pos);
    const usualLead = c.cheapest?.lead_time_days ?? 7;
    const sim = simulate(pos.stock, pos.rate, pos.arrivals, c.horizon);
    runouts.set(key(pos.sku, pos.location), sim.runoutIn);
    if (sim.runoutIn <= usualLead + 2) shortPairs.add(key(pos.sku, pos.location));
  }

  const handled = new Set<string>();
  const push = (issue: Omit<Issue, "recommended" | "priority">) => {
    const recommended = pickBest(issue.options, rejected[issue.id]);
    issues.push({ ...issue, recommended, priority: issue.impact * urgencyFactor(issue.urgencyDays) });
  };

  // 1. Purchase orders that are overdue.
  for (const po of data.purchase_orders) {
    if (!isOpen(po)) continue;
    const late = isIsoDate(po.expected_date) ? diffDays(po.expected_date, asOf) : 0;
    if (late <= 0) continue;
    const loc = poLocation(po);
    let pos = ix.positions.get(key(po.sku, loc));
    const networkView = !pos || pos.rate <= 0;
    if (networkView) {
      // The order feeds a warehouse: judge it against the whole network's stock and demand.
      let stock = 0;
      const series = new Array(WINDOW).fill(0);
      for (const p of ix.positions.values()) {
        if (p.sku !== po.sku) continue;
        stock += p.stock;
        p.series.forEach((v, i) => (series[i] += v));
      }
      const rate = ix.networkRate.get(po.sku) ?? 0;
      pos = {
        sku: po.sku,
        location: loc,
        stock,
        series,
        r7: rate,
        rPrev: rate,
        rate,
        ratio: 1,
        spike: false,
        drop: false,
        arrivals: [],
        incoming: 0,
        overdue: [po],
        cover: rate > 0 ? stock / rate : Infinity,
      };
    }
    const c = mkCtx(pos!);
    const p = pos!;
    const extra = Math.max(settings.latePoExtraDays, Math.min(late, 10));
    const lateArrival = { day: extra, qty: Number(po.qty) || 0 };
    const runout = simulate(p.stock, p.rate, p.arrivals, c.horizon).runoutIn;
    const chaseAction: ActionDraft = { type: "enquiry", purpose: "chase", supplier: po.supplier, po: po.po, sku: po.sku, qty: po.qty, daysLate: late };
    const options: Option[] = [];

    const chase = blank("chase", "chase");
    chase.supplier = po.supplier;
    chase.arrivesInDays = extra;
    chase.notes = [{ code: "assume_late", v: { days: extra, po: po.po } }];
    chase.actions = [chaseAction];
    options.push(finish(chase, c, [lateArrival]));

    if (p.rate > 0 && !networkView) {
      const bridgeNeed = Math.max(1, Math.ceil(p.rate * (extra + 2) - p.stock - p.incoming));
      const donor = pickDonor(donorsFor(ix, p.sku, p.location, shortPairs), bridgeNeed);
      if (donor && runout < extra + 2) {
        const qty = Math.min(donor.surplus, bridgeNeed);
        const o = blank(`chase_transfer:${donor.location}`, "chase_transfer");
        o.from = donor.location;
        o.supplier = po.supplier;
        o.transferQty = qty;
        o.arrivesInDays = donor.days;
        o.freight = freightCost(donor.km, settings);
        o.notes = [
          { code: donor.keep ? "donor_spare" : "donor_spare_wh", v: { from: donor.location, surplus: donor.surplus, keep: donor.keep, days: settings.donorKeepDays } },
          { code: "bridge_until_po", v: { qty, po: po.po, days: extra } },
        ];
        o.actions = [transferDraft(c, donor, qty), chaseAction];
        options.push(finish(o, c, [{ day: donor.days, qty }, lateArrival]));
      }
    }
    if (p.rate > 0 && runout < extra + 2) {
      const backup = c.sups
        .filter((s) => s.supplier !== po.supplier)
        .sort((a, b) => a.lead_time_days - b.lead_time_days || a.price - b.price)[0];
      if (backup) {
        const leftAtArrival = Math.max(0, p.stock - p.rate * backup.lead_time_days);
        const need = Math.max(1, Math.ceil(p.rate * (extra + 3 - backup.lead_time_days) - leftAtArrival));
        const qty = Math.max(backup.moq, need);
        const o = blank(`chase_po:${backup.supplier}`, "chase_po");
        o.supplier = backup.supplier;
        o.supplier2 = po.supplier;
        o.qty = qty;
        o.arrivesInDays = backup.lead_time_days;
        o.premium = c.cheapest ? Math.max(0, backup.price - c.cheapest.price) * qty : 0;
        o.holdingCost = holding(qty, backup.price, p.rate, settings);
        o.cashOut = qty * backup.price;
        o.notes = [
          { code: "backup_logic", v: { supplier: backup.supplier, qty, lead: backup.lead_time_days } },
          ...supplierNotes(c, backup, qty, need, runout).filter((n) => n.code !== "costs_more"),
          { code: "extra_stock_later", v: { qty, po: po.po } },
        ];
        o.actions = [poDraft(c, backup, qty, loc), chaseAction];
        options.push(finish(o, c, [{ day: backup.lead_time_days, qty }, lateArrival]));
      }
    }
    // Baseline for comparison: say nothing and hope it turns up.
    const wait = blank("wait", "wait");
    wait.arrivesInDays = extra + 2;
    wait.notes = [{ code: "no_chase_slips", v: { days: extra + 2 } }];
    options.push(finish(wait, c, [{ day: extra + 2, qty: lateArrival.qty }]));

    const worst = simulate(p.stock, p.rate, p.arrivals, c.horizon);
    handled.add(key(po.sku, loc));
    push({
      id: `overdue_po|${po.po}`,
      kind: "overdue_po",
      sku: po.sku,
      location: loc,
      po: po.po,
      supplier: po.supplier,
      facts: {
        daysLate: late,
        qty: po.qty,
        stock: p.stock,
        rate: round1(p.rate),
        cover: p.rate > 0 ? round1(runout === Infinity ? p.cover : runout) : -1,
        extra,
        network: networkView ? 1 : 0,
        atRisk: runout < extra ? 1 : 0,
      },
      causes: p.spike ? [{ code: "cause_spike", v: { from: round1(p.rPrev), to: round1(p.r7) } }] : [],
      options,
      impact: Math.max(round(worst.lostUnits * c.margin * settings.lostSaleFactor), 500),
      urgencyDays: runout === Infinity ? 30 : runout,
      series: p.series,
    });
  }

  // 2. Parts that will run out before the usual supplier can deliver.
  for (const pos of ix.positions.values()) {
    const k = key(pos.sku, pos.location);
    if (!shortPairs.has(k) || handled.has(k)) continue;
    const c = mkCtx(pos);
    const runout = runouts.get(k)!;
    const donors = donorsFor(ix, pos.sku, pos.location, shortPairs);
    const options = shortageOptions(c, donors, runout);
    if (options.length < 2 || pos.arrivals.length) {
      const wait = blank("wait", "wait");
      wait.arrivesInDays = pos.arrivals.length ? Math.min(...pos.arrivals.map((a) => a.day)) : null;
      wait.notes = [pos.arrivals.length ? { code: "wait_for_inbound", v: { ref: pos.arrivals[0].ref, days: pos.arrivals[0].day } } : { code: "nothing_coming" }];
      options.push(finish(wait, c, []));
    }
    const causes: Note[] = [];
    if (pos.spike) causes.push({ code: "cause_spike", v: { from: round1(pos.rPrev), to: round1(pos.r7) } });
    const lateInbound = pos.arrivals.find((a) => a.day > runout);
    if (lateInbound) causes.push({ code: "cause_po_after", v: { ref: lateInbound.ref, days: lateInbound.day, cover: round1(runout) } });
    const idle = donors[0];
    if (idle) causes.push({ code: "cause_stock_elsewhere", v: { from: idle.location, surplus: idle.surplus } });

    const base = simulate(pos.stock, pos.rate, pos.arrivals, c.horizon);
    const usual = c.cheapest;
    push({
      id: `stockout|${k}`,
      kind: "stockout",
      sku: pos.sku,
      location: pos.location,
      supplier: usual?.supplier,
      facts: {
        stock: pos.stock,
        rate: round1(pos.rate),
        cover: round1(runout),
        usualLead: usual?.lead_time_days ?? -1,
        usualSupplier: usual?.supplier ?? "",
        incoming: pos.incoming,
        horizon: c.horizon,
        lostUnits: round1(base.lostUnits),
        routine: usual && runout >= usual.lead_time_days ? 1 : 0,
      },
      causes,
      options,
      impact: round(base.lostUnits * c.margin * settings.lostSaleFactor),
      urgencyDays: runout,
      series: pos.series,
    });
    handled.add(k);
  }

  // 3. Slow-moving stock tying up cash.
  const KEEP_DAYS = 60;
  for (const pos of ix.positions.values()) {
    if (pos.stock <= 0) continue;
    const c = mkCtx(pos);
    if (!c.cheapest) continue;
    const wh = isWarehouse(pos.location);
    const rate = wh ? ix.networkRate.get(pos.sku) ?? 0 : pos.rate;
    const cover = rate > 0 ? pos.stock / rate : Infinity;
    if (cover <= settings.slowDays) continue;
    const excess = Math.floor(pos.stock - rate * KEEP_DAYS);
    const unit = c.cheapest.price;
    if (excess <= 0) continue;
    const options: Option[] = [];

    const hold = blank("hold", "hold");
    hold.holdingCost = holding(excess, unit, rate, settings);
    if (hold.holdingCost < settings.slowMinCost) continue; // too small to be worth a person's time
    hold.notes = [{ code: rate > 0 ? "hold_days" : "hold_never", v: { days: rate > 0 ? round(Math.min(730, excess / rate)) : 730 } }];
    options.push(finish(hold, { ...c, pos: { ...pos, rate: 0 } }, []));

    // Is there a shelf where this part actually sells?
    let best: { p: Position; room: number } | undefined;
    for (const other of ix.positions.values()) {
      if (other.sku !== pos.sku || other.location === pos.location || other.rate <= 0 || isWarehouse(other.location)) continue;
      const room = Math.ceil(other.rate * KEEP_DAYS - other.stock - other.incoming);
      if (room > 0 && (!best || room > best.room)) best = { p: other, room };
    }
    if (best) {
      const qty = Math.min(excess, best.room);
      const km = roadKm(pos.location, best.p.location);
      const days = transferDays(pos.location, best.p.location);
      const o = blank(`transfer:${best.p.location}`, "transfer");
      o.from = pos.location;
      o.transferQty = qty;
      o.arrivesInDays = days;
      o.freight = freightCost(km, settings);
      o.holdingCost = holding(excess - qty, unit, rate, settings) + holding(qty, unit, best.p.rate, settings);
      o.notes = [
        { code: "sells_there", v: { to: best.p.location, rate: round1(best.p.rate), cover: round(best.p.cover) } },
        { code: "frees_cash", v: { cash: qty * unit, qty } },
      ];
      if (shortPairs.has(key(pos.sku, best.p.location))) o.notes.push({ code: "fixes_shortage", v: { to: best.p.location } });
      o.actions = [
        {
          type: "transfer",
          id: ids.nextTr(),
          sku: pos.sku,
          from: pos.location,
          to: best.p.location,
          qty,
          days,
          eta: addDays(asOf, days),
          freight: round(freightCost(km, settings)),
          km,
        },
      ];
      options.push(finish(o, { ...c, pos: { ...pos, rate: 0 } }, []));
    }

    const md = blank("markdown", "markdown");
    md.qty = excess;
    md.writeOff = (excess * unit * settings.markdownPct) / 100;
    md.notes = [{ code: "markdown_logic", v: { pct: settings.markdownPct, cash: round(excess * unit * (1 - settings.markdownPct / 100)) } }];
    md.actions = [{ type: "alert", purpose: "markdown", location: pos.location, sku: pos.sku, qty: excess, pct: settings.markdownPct }];
    options.push(finish(md, { ...c, pos: { ...pos, rate: 0 } }, []));

    push({
      id: `slow_stock|${key(pos.sku, pos.location)}`,
      kind: "slow_stock",
      sku: pos.sku,
      location: pos.location,
      facts: {
        stock: pos.stock,
        rate: round1(rate),
        cover: cover === Infinity ? -1 : round(cover),
        excess,
        cash: excess * unit,
        unit,
        sold28: pos.series.reduce((a, b) => a + b, 0),
      },
      causes: [],
      options,
      impact: round(hold.holdingCost),
      urgencyDays: 30,
      series: pos.series,
    });
  }

  // 4. An open order placed with a supplier whose MOQ is far more than the network sells.
  for (const po of data.purchase_orders) {
    if (!isOpen(po)) continue;
    const dueIn = isIsoDate(po.expected_date) ? diffDays(asOf, po.expected_date) : -1;
    if (dueIn < 0) continue;
    const rate = ix.networkRate.get(po.sku) ?? 0;
    if (rate <= 0) continue;
    const sups = ix.suppliers.get(po.sku) ?? [];
    const cur = sups.find((s) => s.supplier === po.supplier);
    if (!cur) continue;
    const days = po.qty / rate;
    if (days <= 150) continue;
    const alt = sups.filter((s) => s.supplier !== cur.supplier && s.moq <= po.qty / 2).sort((a, b) => a.price - b.price)[0];
    if (!alt) continue;
    const loc = poLocation(po);
    const pos: Position = ix.positions.get(key(po.sku, loc)) ?? {
      sku: po.sku, location: loc, stock: 0, series: new Array(WINDOW).fill(0), r7: 0, rPrev: 0, rate: 0, ratio: 1,
      spike: false, drop: false, arrivals: [], incoming: 0, overdue: [], cover: Infinity,
    };
    const c = { ...mkCtx(pos), pos: { ...pos, rate: 0 } };

    const keep = blank("keep_po", "keep_po");
    keep.supplier = cur.supplier;
    keep.qty = po.qty;
    keep.arrivesInDays = dueIn;
    keep.holdingCost = holding(po.qty, cur.price, rate, settings);
    keep.cashOut = po.qty * cur.price;
    keep.notes = [{ code: "keep_logic", v: { days: round(days), cash: po.qty * cur.price } }];
    finish(keep, c, []);

    const newQty = Math.max(alt.moq, Math.ceil(rate * KEEP_DAYS));
    const sw = blank(`switch_supplier:${alt.supplier}`, "switch_supplier");
    sw.supplier = alt.supplier;
    sw.supplier2 = cur.supplier;
    sw.qty = newQty;
    sw.arrivesInDays = alt.lead_time_days;
    sw.premium = Math.max(0, alt.price - cur.price) * newQty;
    sw.holdingCost = holding(newQty, alt.price, rate, settings);
    sw.cashOut = newQty * alt.price;
    sw.notes = [
      { code: "switch_logic", v: { supplier: alt.supplier, moq: alt.moq, qty: newQty, days: round(newQty / rate) } },
      { code: "frees_cash", v: { cash: po.qty * cur.price - newQty * alt.price, qty: po.qty - newQty } },
      { code: "costs_more", v: { supplier: alt.supplier, perUnit: round(alt.price - cur.price), pct: round(((alt.price - cur.price) / cur.price) * 100) } },
    ];
    sw.actions = [
      { type: "enquiry", purpose: "reduce", supplier: cur.supplier, po: po.po, sku: po.sku, qty: po.qty, newQty: 0 },
      poDraft(c, alt, newQty, loc),
    ];
    finish(sw, c, []);
    if (keep.totalImpact - sw.totalImpact < 1000) continue;

    push({
      id: `supplier_fit|${po.po}`,
      kind: "supplier_fit",
      sku: po.sku,
      location: loc,
      po: po.po,
      supplier: cur.supplier,
      facts: { qty: po.qty, moq: cur.moq, rate: round1(rate), days: round(days), cash: po.qty * cur.price, dueIn, alt: alt.supplier, altMoq: alt.moq },
      causes: [],
      options: [sw, keep],
      impact: keep.totalImpact - sw.totalImpact,
      urgencyDays: Math.max(1, dueIn),
      series: pos.series,
    });
  }

  // 5. Demand that suddenly jumped or dropped at one location (and is not already covered above).
  for (const pos of ix.positions.values()) {
    const k = key(pos.sku, pos.location);
    if ((!pos.spike && !pos.drop) || handled.has(k)) continue;
    const c = mkCtx(pos);
    const unit = c.cheapest?.price ?? 0;
    let others = 0;
    let sameWay = 0;
    for (const p of ix.positions.values()) {
      if (p.sku !== pos.sku || p.location === pos.location || isWarehouse(p.location) || p.rPrev <= 0) continue;
      others++;
      if (pos.spike ? p.ratio >= 1.4 : p.ratio <= 0.7) sameWay++;
    }
    const local = others === 0 || sameWay / others < 0.5;
    const causes: Note[] = [{ code: local ? "only_here" : "across_network", v: { others, sameWay } }];
    const options: Option[] = [];
    const s = settings;

    if (pos.spike) {
      const ask = blank("ask_store", "ask_store");
      ask.notes = [{ code: "ask_spike_logic", v: { cover: round(pos.cover) } }];
      ask.actions = [{ type: "alert", purpose: "confirm_spike", location: pos.location, sku: pos.sku, from: round1(pos.rPrev), to: round1(pos.r7) }];
      options.push(finish(ask, c, []));

      const want = Math.ceil(pos.rate * (s.coverDays + 14) - pos.stock - pos.incoming);
      const donor = want > 0 ? pickDonor(donorsFor(ix, pos.sku, pos.location, shortPairs), want) : undefined;
      if (donor) {
        const qty = Math.min(donor.surplus, want);
        const o = blank(`transfer:${donor.location}`, "transfer");
        o.from = donor.location;
        o.transferQty = qty;
        o.arrivesInDays = donor.days;
        o.freight = freightCost(donor.km, s);
        o.notes = [{ code: "preposition", v: { qty, from: donor.location, days: s.coverDays + 14 } }];
        o.actions = [transferDraft(c, donor, qty)];
        options.push(finish(o, c, [{ day: donor.days, qty }]));
      }
      if (c.cheapest && want > 0) {
        const qty = Math.max(c.cheapest.moq, want);
        const o = blank(`po:${c.cheapest.supplier}`, "po");
        o.supplier = c.cheapest.supplier;
        o.qty = qty;
        o.arrivesInDays = c.cheapest.lead_time_days;
        o.holdingCost = holding(qty, c.cheapest.price, pos.rPrev > 0 ? pos.rPrev : pos.rate, s);
        o.cashOut = qty * c.cheapest.price;
        o.notes = [{ code: "buy_ahead_risk", v: { qty, days: pos.rPrev > 0 ? round(qty / pos.rPrev) : 0 } }];
        o.actions = [poDraft(c, c.cheapest, qty, pos.location)];
        options.push(finish(o, c, [{ day: c.cheapest.lead_time_days, qty }]));
      }
      if (options.length < 2) {
        const w = blank("wait", "wait");
        w.notes = [{ code: "watch_only" }];
        options.push(finish(w, c, []));
      }
      push({
        id: `demand_spike|${k}`,
        kind: "demand_spike",
        sku: pos.sku,
        location: pos.location,
        facts: { from: round1(pos.rPrev), to: round1(pos.r7), times: round1(pos.ratio), stock: pos.stock, cover: round(pos.cover), local: local ? 1 : 0 },
        causes,
        options,
        impact: round((pos.r7 - pos.rPrev) * 7 * c.margin),
        urgencyDays: pos.cover,
        series: pos.series,
      });
    } else {
      const surplus = Math.max(0, Math.floor(pos.stock + pos.incoming - pos.rate * KEEP_DAYS));
      const zero = { ...c, pos: { ...pos, rate: 0 } };
      const ask = blank("ask_store", "ask_store");
      ask.holdingCost = holding(surplus, unit, pos.rate, s);
      ask.notes = [{ code: "ask_drop_logic", v: { surplus, cash: surplus * unit } }];
      ask.actions = [{ type: "alert", purpose: "confirm_drop", location: pos.location, sku: pos.sku, from: round1(pos.rPrev), to: round1(pos.r7) }];
      options.push(finish(ask, zero, []));

      let best: { p: Position; room: number } | undefined;
      for (const other of ix.positions.values()) {
        if (other.sku !== pos.sku || other.location === pos.location || other.rate <= 0 || isWarehouse(other.location)) continue;
        const room = Math.ceil(other.rate * KEEP_DAYS - other.stock - other.incoming);
        if (room > 0 && (!best || room > best.room)) best = { p: other, room };
      }
      const movable = Math.min(surplus, Math.max(0, Math.floor(pos.stock - pos.rate * s.donorKeepDays)));
      if (best && movable > 0) {
        const qty = Math.min(movable, best.room);
        const km = roadKm(pos.location, best.p.location);
        const days = transferDays(pos.location, best.p.location);
        const o = blank(`transfer:${best.p.location}`, "transfer");
        o.from = pos.location;
        o.transferQty = qty;
        o.arrivesInDays = days;
        o.freight = freightCost(km, s);
        o.holdingCost = holding(surplus - qty, unit, pos.rate, s) + holding(qty, unit, best.p.rate, s);
        o.notes = [{ code: "sells_there", v: { to: best.p.location, rate: round1(best.p.rate), cover: round(best.p.cover) } }];
        o.actions = [{ type: "transfer", id: ids.nextTr(), sku: pos.sku, from: pos.location, to: best.p.location, qty, days, eta: addDays(asOf, days), freight: round(freightCost(km, s)), km }];
        options.push(finish(o, zero, []));
      }
      if (options.length < 2) {
        const w = blank("wait", "wait");
        w.holdingCost = holding(surplus, unit, pos.rate, s);
        w.notes = [{ code: "watch_only" }];
        options.push(finish(w, zero, []));
      }
      if (pos.arrivals.length) causes.push({ code: "inbound_adds", v: { ref: pos.arrivals[0].ref, qty: pos.arrivals[0].qty, days: pos.arrivals[0].day } });
      push({
        id: `demand_drop|${k}`,
        kind: "demand_drop",
        sku: pos.sku,
        location: pos.location,
        facts: { from: round1(pos.rPrev), to: round1(pos.r7), pct: round((1 - pos.ratio) * 100), stock: pos.stock, incoming: pos.incoming, surplus, cash: surplus * unit, local: local ? 1 : 0 },
        causes,
        options,
        impact: Math.max(round(holding(surplus, unit, pos.rate, s)), 300),
        urgencyDays: 14,
        series: pos.series,
      });
    }
  }

  issues.sort((a, b) => b.priority - a.priority || a.urgencyDays - b.urgencyDays);

  return {
    asOf,
    stats: {
      salesRows: data.sales.length,
      stockLines: data.inventory.length,
      supplierLines: data.suppliers.length,
      openPOs: data.purchase_orders.filter(isOpen).length,
      positions: ix.positions.size,
      optionsCompared: issues.reduce((n, i) => n + i.options.length, 0),
      drafts: issues.filter((i) => i.recommended).length,
    },
    issues,
  };
}
