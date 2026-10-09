import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

// Optional wording layer. The numbers always come from the engine in the
// browser; a language model, when a key is configured, only rephrases them.
// Keys live in environment variables and never reach the client.

const LANGUAGE: Record<string, string> = { en: "English", hi: "Hindi", kn: "Kannada", ta: "Tamil", te: "Telugu" };

type Body = { question?: unknown; lang?: unknown; facts?: unknown; draft?: unknown };

function systemPrompt(language: string) {
  return [
    "You are Kaveri Desk, the purchasing assistant of Kaveri Spares & Hydraulics, a spare-parts distributor in North Karnataka.",
    `Answer in ${language}, in plain sentences a busy shop owner can read in ten seconds. No markdown.`,
    "Use only the figures in DATA. Never invent or estimate a number. Write rupees as ₹.",
    "If DATA does not contain the answer, say you do not have that in the records.",
    "DRAFT is an answer calculated from the same records. Keep every number in it; you may reword it and add the reasoning from DATA.",
    "Keep it under 120 words.",
  ].join(" ");
}

async function askAnthropic(key: string, system: string, user: string, signal: AbortSignal) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}`);
  const json = await res.json();
  return json?.content?.[0]?.text as string | undefined;
}

async function askGemini(key: string, system: string, user: string, signal: AbortSignal) {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
    }),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const json = await res.json();
  return json?.candidates?.[0]?.content?.parts?.[0]?.text as string | undefined;
}

export async function POST(req: Request) {
  if (!(await currentUser())) return NextResponse.json({ answer: null, reason: "unauthenticated" }, { status: 401 });
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ answer: null, reason: "bad_request" }, { status: 400 });
  }
  const question = typeof body.question === "string" ? body.question.slice(0, 500) : "";
  const facts = typeof body.facts === "string" ? body.facts.slice(0, 60000) : "";
  const draft = typeof body.draft === "string" ? body.draft.slice(0, 4000) : "";
  const language = LANGUAGE[typeof body.lang === "string" ? body.lang : "en"] ?? "English";
  if (!question) return NextResponse.json({ answer: null, reason: "bad_request" }, { status: 400 });

  const anthropic = process.env.ANTHROPIC_API_KEY;
  const gemini = process.env.GEMINI_API_KEY;
  if (!anthropic && !gemini) return NextResponse.json({ answer: null, reason: "no_key" });

  const user = `QUESTION: ${question}\n\nDRAFT: ${draft}\n\nDATA: ${facts}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const text = anthropic
      ? await askAnthropic(anthropic, systemPrompt(language), user, controller.signal)
      : await askGemini(gemini as string, systemPrompt(language), user, controller.signal);
    return NextResponse.json({ answer: text?.trim() || null, reason: text ? "ok" : "empty" });
  } catch (err) {
    console.error("[chat] model call failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ answer: null, reason: "model_error" });
  } finally {
    clearTimeout(timer);
  }
}
