import type { Issue, Option } from "../types";

// Who may approve what. This file is shared by the server and the browser, so
// it holds no secrets: only the rules.
//
// - Head of Purchasing approves anything: orders, transfers and messages.
// - A store manager approves stock moves and store messages that involve
//   their own store. Anything that commits company cash (a purchase order or
//   a supplier message) goes to the Head of Purchasing as a request.
// - Finance and audit can look at everything and approve nothing.

export type Role = "purchasing" | "store" | "viewer";

export type SessionUser = {
  id: string;
  name: string;
  role: Role;
  store?: string;
  initials: string;
};

export type Right = "approve" | "request" | "none";

export function approvalRight(user: SessionUser, issue: Issue, option: Option): Right {
  if (user.role === "purchasing") return "approve";
  if (user.role === "viewer" || !user.store) return "none";
  const store = user.store;
  if (option.actions.length === 0) return issue.location === store ? "approve" : "request";
  const own = option.actions.every(
    (a) => (a.type === "transfer" && (a.from === store || a.to === store)) || (a.type === "alert" && a.location === store),
  );
  return own ? "approve" : "request";
}

export function canEditRecords(user: SessionUser): boolean {
  return user.role !== "viewer";
}

/** Does this problem touch the user's store, either directly or through the recommended move? */
export function touchesStore(issue: Issue, store: string): boolean {
  if (issue.location === store) return true;
  const rec = issue.options.find((o) => o.id === issue.recommended);
  return Boolean(rec?.actions.some((a) => (a.type === "transfer" && (a.from === store || a.to === store)) || (a.type === "alert" && a.location === store)));
}
