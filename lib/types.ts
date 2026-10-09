// The five record types are exactly what the challenge says the business keeps.
// `location` on a purchase order is optional: when missing, the order is
// assumed to be delivered to the main warehouse.

export type Product = {
  sku: string;
  name: string;
  machine_model: string;
  category: string;
  // Optional, from the database: how the part's demand behaves (lib/data/carparts.ts).
  demand_class?: "smooth" | "erratic" | "intermittent" | "lumpy" | "none";
};
export type InventoryRow = { sku: string; location: string; stock: number };
export type SaleRow = { date: string; sku: string; location: string; qty_sold: number };
export type SupplierRow = { supplier: string; sku: string; price: number; lead_time_days: number; moq: number };
export type PurchaseOrder = {
  po: string;
  supplier: string;
  sku: string;
  qty: number;
  expected_date: string;
  status: string; // open | received | cancelled
  location?: string;
};

// Created only by actions a person approved inside this app.
export type Transfer = { id: string; sku: string; from: string; to: string; qty: number; eta: string };

// Average daily sales over the last 180 days, from the full history in the database.
export type LongRate = { sku: string; location: string; rate180: number };

export type Dataset = {
  products: Product[];
  inventory: InventoryRow[];
  sales: SaleRow[];
  suppliers: SupplierRow[];
  purchase_orders: PurchaseOrder[];
  transfers: Transfer[];
  // Optional. The agent only reads the last five weeks of sales; this adds the six-month view
  // for parts that sell in bursts months apart.
  longRates?: LongRate[];
};

// Business assumptions the agent needs but the five files do not contain.
// All of them are shown and editable on the Data screen.
export type Settings = {
  marginPct: number; // gross margin earned on a sale, % of purchase price
  holdingPctYear: number; // yearly cost of holding stock, % of its value
  freightPerKm: number; // tempo cost per km for a store transfer
  freightMin: number; // minimum charge for any transfer
  coverDays: number; // days of stock a reorder should aim for
  donorKeepDays: number; // days of its own demand a location keeps before lending
  slowDays: number; // stock lasting longer than this is slow-moving
  markdownPct: number; // discount needed to clear dead stock
  latePoExtraDays: number; // minimum extra wait assumed for an overdue order
  lostSaleFactor: number; // a lost sale costs this many times its margin (the customer shops elsewhere)
  slowMinCost: number; // ignore slow stock that costs less than this to carry
};

export const DEFAULT_SETTINGS: Settings = {
  marginPct: 25,
  holdingPctYear: 18,
  freightPerKm: 16,
  freightMin: 350,
  coverDays: 30,
  donorKeepDays: 21,
  slowDays: 120,
  markdownPct: 15,
  latePoExtraDays: 3,
  lostSaleFactor: 2,
  slowMinCost: 1500,
};

export type IssueKind =
  | "stockout"
  | "overdue_po"
  | "slow_stock"
  | "supplier_fit"
  | "demand_spike"
  | "demand_drop";

export type OptionType =
  | "transfer"
  | "po"
  | "transfer_po"
  | "split_po"
  | "wait"
  | "chase"
  | "chase_transfer"
  | "chase_po"
  | "markdown"
  | "hold"
  | "switch_supplier"
  | "keep_po"
  | "ask_store";

export type ActionDraft =
  | {
      type: "po";
      po: string;
      supplier: string;
      sku: string;
      qty: number;
      price: number;
      total: number;
      location: string;
      leadDays: number;
      expected_date: string;
    }
  | {
      type: "transfer";
      id: string;
      sku: string;
      from: string;
      to: string;
      qty: number;
      days: number;
      eta: string;
      freight: number;
      km: number;
    }
  | { type: "enquiry"; purpose: "chase" | "reduce"; supplier: string; po: string; sku: string; qty: number; newQty?: number; daysLate?: number }
  | { type: "alert"; purpose: "markdown" | "confirm_spike" | "confirm_drop"; location: string; sku: string; qty?: number; pct?: number; from?: number; to?: number };

// A reason code plus the numbers that back it. The screen turns these into a
// sentence in whichever language is selected.
export type Note = { code: string; v?: Record<string, string | number> };

export type Option = {
  id: string;
  type: OptionType;
  supplier?: string;
  supplier2?: string;
  from?: string;
  qty: number; // units bought (or cleared, for markdown)
  transferQty: number;
  arrivesInDays: number | null; // when the first relief arrives
  stockoutDays: number;
  lostUnits: number;
  lostMargin: number; // sales margin lost while the shelf is empty
  freight: number;
  premium: number; // extra paid over the cheapest supplier
  holdingCost: number; // cost of carrying surplus stock
  writeOff: number; // discount given away
  cashOut: number; // money that leaves the bank for this option
  totalImpact: number; // lostMargin + freight + premium + holdingCost + writeOff
  notes: Note[];
  actions: ActionDraft[];
};

export type Issue = {
  id: string;
  kind: IssueKind;
  sku: string;
  location: string;
  po?: string;
  supplier?: string;
  facts: Record<string, number | string>;
  causes: Note[];
  options: Option[];
  recommended: string; // option id
  impact: number; // rupees lost if nothing is done
  urgencyDays: number; // days until it starts to hurt
  priority: number;
  series: number[]; // last 28 days of sales, oldest first
};

export type Analysis = {
  asOf: string;
  stats: {
    salesRows: number;
    stockLines: number;
    supplierLines: number;
    openPOs: number;
    positions: number;
    optionsCompared: number;
    drafts: number;
  };
  issues: Issue[];
};

export type LogEntry = {
  id: string;
  at: string;
  decision: "approved" | "rejected" | "requested";
  issueId: string;
  kind: IssueKind;
  sku: string;
  location: string;
  option: Option;
  reason?: string;
  by?: string; // name of the person who decided
};

// A problem someone approved today, kept so the screen can show what was decided.
export type Handled = { issue: Issue; option: Option; at: string; by?: string };

// A store manager asking the Head of Purchasing to approve an option they may not approve themselves.
export type ApprovalRequest = { issueId: string; optionId: string; by: string; byName: string; at: string };
