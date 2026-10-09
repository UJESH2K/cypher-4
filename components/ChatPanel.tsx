"use client";

import { useEffect, useRef, useState } from "react";
import { answer, factsForModel, type Intent } from "@/lib/chat";
import { type Key, type Lang, t } from "@/lib/i18n";
import type { Analysis, Dataset, Settings } from "@/lib/types";

type Props = {
  lang: Lang;
  data: Dataset;
  analysis: Analysis;
  settings: Settings;
  handled: Record<string, unknown>;
  onClose: () => void;
};

type Msg = { who: "me" | "desk"; text: string; source?: "rules" | "llm" };

// Once the server says no language-model key is set, stop asking it.
let modelOff = false;

export default function ChatPanel({ lang, data, analysis, settings, handled, onClose }: Props) {
  const T = (k: Key) => t(lang, k);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs, busy]);

  const chips: { label: Key; intent: Intent }[] = [
    { label: "chat.q1", intent: { type: "top" } },
    { label: "chat.q2", intent: { type: "late" } },
    { label: "chat.q3", intent: { type: "stuck" } },
  ];
  if (analysis.issues.some((i) => i.location === "Gokak")) chips.push({ label: "chat.q4", intent: { type: "why", location: "Gokak" } });
  if (data.products.some((p) => p.sku === "HS-114")) chips.push({ label: "chat.q5", intent: { type: "suppliers", sku: "HS-114" } });

  const ask = async (question: string, intent: Intent) => {
    if (busy || !question.trim()) return;
    const ctx = { data, analysis, settings, handled };
    const draft = answer(intent, lang, ctx);
    setMsgs((m) => [...m, { who: "me", text: question }]);
    setText("");
    if (modelOff) {
      setMsgs((m) => [...m, { who: "desk", text: draft, source: "rules" }]);
      return;
    }
    setBusy(true);
    let reply: Msg = { who: "desk", text: draft, source: "rules" };
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, lang, draft, facts: factsForModel(ctx) }),
      });
      const json = await res.json();
      if (json.reason === "no_key") modelOff = true;
      if (typeof json.answer === "string" && json.answer) reply = { who: "desk", text: json.answer, source: "llm" };
    } catch {
      // Offline or the server is unreachable: the calculated answer stands.
    }
    setBusy(false);
    setMsgs((m) => [...m, reply]);
  };

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <aside className="chat" role="dialog" aria-modal="true" aria-labelledby="chat-title">
        <div className="chat-head">
          <h2 id="chat-title">{T("chat.title")}</h2>
          <button className="btn ghost small" onClick={onClose}>
            {T("chat.close")}
          </button>
        </div>
        <div className="chat-body" aria-live="polite">
          <p className="bubble desk">{T("chat.hello")}</p>
          {msgs.map((m, i) => (
            <p key={i} className={`bubble ${m.who}`}>
              {m.text}
              {m.source && <small>{T(m.source === "llm" ? "chat.src.llm" : "chat.src.rules")}</small>}
            </p>
          ))}
          {busy && (
            <p className="bubble desk" role="status">
              <span className="pulse" />
              {T("chat.thinking")}
            </p>
          )}
          <div ref={end} />
        </div>
        <div className="chat-foot">
          <div className="chips">
            {chips.map((c) => (
              <button key={c.label} className="btn small" disabled={busy} onClick={() => ask(T(c.label), c.intent)}>
                {T(c.label)}
              </button>
            ))}
          </div>
          <form
            className="chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              ask(text, { type: "free", text });
            }}
          >
            <label className="sr-only" htmlFor="chat-input">
              {T("chat.placeholder")}
            </label>
            <input id="chat-input" ref={input} className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={T("chat.placeholder")} maxLength={300} autoComplete="off" />
            <button className="btn primary" type="submit" disabled={busy || !text.trim()}>
              {T("chat.send")}
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
