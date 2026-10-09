import type { Issue, Option } from "@/lib/types";

export type View = "today" | "problems" | "decisions" | "records";
export const VIEWS: View[] = ["today", "problems", "decisions", "records"];

export type Route = { view: View; id: string | null };

export type Handled = { issue: Issue; option: Option; at: string; by?: string };

export type Toast = { id: number; tone: "success" | "info" | "error"; text: string };

export type Theme = "light" | "dark";
