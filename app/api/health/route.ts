import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Health check for uptime monitors and the Docker HEALTHCHECK.
export function GET() {
  const llm = process.env.ANTHROPIC_API_KEY ? "anthropic" : process.env.GEMINI_API_KEY ? "gemini" : "none";
  return NextResponse.json({ status: "ok", service: "kaveri-desk", time: new Date().toISOString(), llm });
}
