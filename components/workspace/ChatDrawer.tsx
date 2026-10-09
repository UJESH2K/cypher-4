"use client";

import { ArrowUp, Database, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
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

type Msg = { id: number; who: "me" | "desk"; text: string; source?: "rules" | "llm" };

// Once the server says no language-model key is set, stop asking it.
let modelOff = false;

export default function ChatDrawer({ lang, data, analysis, settings, handled, onClose }: Props) {
  const T = (k: Key) => t(lang, k);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const back = useRef<Element | null>(null);

  useEffect(() => {
    back.current = document.activeElement;
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (back.current instanceof HTMLElement) back.current.focus();
    };
  }, [onClose]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
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
    setMsgs((m) => [...m, { id: Date.now(), who: "me", text: question }]);
    setText("");
    if (modelOff) {
      setBusy(true);
      // A short pause so the answer reads as a reply rather than a page jump.
      window.setTimeout(() => {
        setMsgs((m) => [...m, { id: Date.now() + 1, who: "desk", text: draft, source: "rules" }]);
        setBusy(false);
      }, 380);
      return;
    }
    setBusy(true);
    let reply: Msg = { id: Date.now() + 1, who: "desk", text: draft, source: "rules" };
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, lang, draft, facts: factsForModel(ctx) }),
      });
      const json = await res.json();
      if (json.reason === "no_key") modelOff = true;
      if (typeof json.answer === "string" && json.answer) reply = { ...reply, text: json.answer, source: "llm" };
    } catch {
      // Offline or the server is unreachable: the calculated answer stands.
    }
    setBusy(false);
    setMsgs((m) => [...m, reply]);
  };

  return (
    <>
      <motion.div className="scrim" style={{ zIndex: 45 }} aria-hidden="true" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-title"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 40 }}
      >
        <div className="drawer-head">
          <span className="bot" aria-hidden="true">
            <Sparkles size={19} />
          </span>
          <div>
            <h2 id="chat-title">{T("chat.title")}</h2>
            <p>{T("chat.src.rules")}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label={T("chat.close")}>
            <X size={20} />
          </button>
        </div>
        <div className="chat-body" aria-live="polite">
          <motion.p className="say desk" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            {T("chat.hello")}
          </motion.p>
          <AnimatePresence initial={false}>
            {msgs.map((m) => (
              <motion.p key={m.id} className={`say ${m.who}`} initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.25 }}>
                {m.text}
                {m.source && (
                  <small>
                    {m.source === "llm" ? <Sparkles size={12} aria-hidden="true" /> : <Database size={12} aria-hidden="true" />}
                    {T(m.source === "llm" ? "chat.src.llm" : "chat.src.rules")}
                  </small>
                )}
              </motion.p>
            ))}
          </AnimatePresence>
          {busy && (
            <p className="say desk" role="status" aria-label={T("chat.thinking")}>
              <span className="typing" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </p>
          )}
          <div ref={end} />
        </div>
        <div className="chat-foot">
          <div className="suggest">
            {chips.map((c) => (
              <button key={c.label} disabled={busy} onClick={() => ask(T(c.label), c.intent)}>
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
            <button className="send" type="submit" disabled={busy || !text.trim()} aria-label={T("chat.send")}>
              <ArrowUp size={20} />
            </button>
          </form>
        </div>
      </motion.aside>
    </>
  );
}
