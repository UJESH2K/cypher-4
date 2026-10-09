export type View = "today" | "problems" | "decisions" | "records";
export const VIEWS: View[] = ["today", "problems", "decisions", "records"];

export type Route = { view: View; id: string | null };

export type { Handled } from "@/lib/types";

export type Toast = { id: number; tone: "success" | "info" | "error"; text: string };

export type Theme = "light" | "dark";

// Where the books come from: the database, or the built-in sample in this browser.
export type Mode = "loading" | "server" | "local";
export type AgentRunInfo = { at: string; ms: number; recordsRead: number; problems: number };
