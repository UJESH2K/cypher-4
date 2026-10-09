import { NextResponse } from "next/server";
import { usingDemoSecret } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// Health check for uptime monitors and the Docker HEALTHCHECK.
export function GET() {
  const llm = process.env.ANTHROPIC_API_KEY ? "anthropic" : process.env.GEMINI_API_KEY ? "gemini" : "none";
  const auth = usingDemoSecret() ? "demo-secret" : "env-secret";
  return NextResponse.json({ status: "ok", service: "kaveri-desk", time: new Date().toISOString(), llm, auth });
}
