"use client";

import { ArrowRight, Check, ChevronRight, CircleAlert, Eye, EyeOff, Globe, KeyRound, LoaderCircle, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { AnimatePresence, motion, useAnimate } from "motion/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import NetworkMap from "@/components/NetworkMap";
import { Avatar, BrandMark, KindBadge, roleCan, roleLabel } from "@/components/ui";
import type { DemoLogin } from "@/lib/auth/demo";
import { toIso } from "@/lib/dates";
import { analyse } from "@/lib/engine";
import { gsap, prefersReducedMotion, SplitText, useGSAP } from "@/lib/gsap";
import { type Key, type Lang, LANGS, money, num, t } from "@/lib/i18n";
import { saveLang } from "@/lib/lang-cookie";
import { issueTitle, optionLabel } from "@/lib/present";
import { buildSample } from "@/lib/sample";
import { type Analysis, type Dataset, DEFAULT_SETTINGS } from "@/lib/types";

type Props = { initialLang: Lang; demo: DemoLogin[] };
type Preview = { data: Dataset; analysis: Analysis; records: number };

const STEPS: Key[] = ["step.observe", "step.reason", "step.evaluate", "step.decide", "step.act", "step.explain"];
// Which loop steps light up for each card in the hero feed.
const LIT: number[][] = [[0], [1], [2, 3], [4, 5]];

export default function LoginScreen({ initialLang, demo }: Props) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<Key | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [tick, setTick] = useState(0);
  const typing = useRef<number | null>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const hero = useRef<HTMLElement>(null);
  const [card, animateCard] = useAnimate();
  const T = (k: Key, v?: Record<string, string | number>) => t(lang, k, v);

  // The hero shows what the real engine finds in this morning's sample data.
  // Built after mount, because "today" must be the reader's date, not the server's.
  useEffect(() => {
    const today = toIso(new Date());
    const data = buildSample(today);
    const analysis = analyse(data, DEFAULT_SETTINGS, today);
    const records = data.sales.length + data.inventory.length + data.suppliers.length + data.purchase_orders.length + data.products.length;
    setPreview({ data, analysis, records });
  }, []);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const timer = window.setInterval(() => setTick((n) => n + 1), 2600);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => () => {
    if (typing.current) window.clearInterval(typing.current);
  }, []);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const split = SplitText.create(".auth-title", { type: "words", mask: "words" });
      const tl = gsap.timeline({ defaults: { ease: "power4.out" } });
      tl.from(split.words, { yPercent: 110, duration: 1.1, stagger: 0.045 })
        .from(".auth-sub", { opacity: 0, y: 14, duration: 0.8 }, "-=0.7")
        .from(".auth-stage", { opacity: 0, y: 24, duration: 0.9 }, "-=0.6")
        .from(".auth-loop span", { opacity: 0, y: 8, duration: 0.5, stagger: 0.05 }, "-=0.6");
      return () => split.revert();
    },
    { scope: hero, dependencies: [lang], revertOnUpdate: true },
  );

  const changeLang = (l: Lang) => {
    setLang(l);
    saveLang(l);
  };

  const top = preview?.analysis.issues.slice(0, 3) ?? [];
  const issue = top.length ? top[Math.floor(tick / 4) % top.length] : undefined;
  const step = tick % 4;
  const rec = issue?.options.find((o) => o.id === issue.recommended);
  const lit = new Set(LIT[step]);

  const feed = !preview || !issue
    ? []
    : [
      { key: "read", eyebrow: T("step.observe"), text: T("login.feed.read", { n: num(preview.records) }) },
      { key: "found", eyebrow: T("login.feed.found"), text: issueTitle(lang, issue, preview.data), badge: true },
      { key: "plan", eyebrow: T("login.feed.plan"), text: rec ? `${optionLabel(lang, rec, issue)} · ${money(rec.totalImpact)}` : "" },
      { key: "wait", eyebrow: T("login.feed.wait"), text: T("approve.note") },
      ].slice(0, step + 1);

  const fill = (d: DemoLogin) => {
    if (state !== "idle") return;
    setPicked(d.id);
    setError(null);
    if (typing.current) window.clearInterval(typing.current);
    if (prefersReducedMotion()) {
      setId(d.id);
      setPassword(d.password);
      submitRef.current?.focus();
      return;
    }
    setId("");
    setPassword("");
    let i = 0;
    const total = d.id.length + d.password.length;
    typing.current = window.setInterval(() => {
      i += 1;
      if (i <= d.id.length) setId(d.id.slice(0, i));
      else setPassword(d.password.slice(0, i - d.id.length));
      if (i >= total && typing.current) {
        window.clearInterval(typing.current);
        typing.current = null;
        submitRef.current?.focus();
      }
    }, 34);
  };

  const shake = () => {
    if (card.current && !prefersReducedMotion()) animateCard(card.current, { x: [0, -10, 9, -6, 4, 0] }, { duration: 0.42 });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (state !== "idle") return;
    if (!id.trim() || !password) {
      setError("login.error");
      shake();
      return;
    }
    setState("busy");
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, password }),
      });
      if (res.ok) {
        setState("done");
        window.setTimeout(() => window.location.assign("/"), 550);
        return;
      }
      setError(res.status === 429 ? "login.error.rate" : "login.error");
    } catch {
      setError("login.error.network");
    }
    setState("idle");
    shake();
  };

  return (
    <div className="auth" lang={lang}>
      <section className="auth-hero" ref={hero} aria-labelledby="auth-hero-title">
        <div className="auth-brand">
          <BrandMark />
          <div>
            <div className="brand-name">{T("app.name")}</div>
            <div className="brand-sub">Kaveri Spares &amp; Hydraulics · North Karnataka</div>
          </div>
        </div>

        <div className="auth-copy">
          <h2 className="auth-title" id="auth-hero-title" key={lang}>
            {T("login.hero.a")} <em>{T("login.hero.b")}</em>
          </h2>
          <p className="auth-sub">{T("login.hero.sub")}</p>
        </div>

        <div className="auth-stage" aria-hidden="true">
          {preview && <NetworkMap lang={lang} issues={preview.analysis.issues} data={preview.data} title={T("today.network")} decorative />}
          <div className="feed">
            <AnimatePresence mode="popLayout" initial={false}>
              {feed.map((c, i) => (
                <motion.div
                  key={`${issue?.id}-${c.key}`}
                  layout
                  className={`feed-card${i === feed.length - 1 ? " hot" : ""}`}
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
                  transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
                >
                  <div className="eyebrow">
                    {c.key === "wait" ? <ShieldCheck size={13} /> : c.key === "plan" ? <Sparkles size={13} /> : null}
                    {c.badge && issue ? <KindBadge lang={lang} issue={issue} /> : c.eyebrow}
                  </div>
                  <p>{c.text}</p>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        <div className="auth-loop" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span key={s} className={lit.has(i) ? "on" : ""}>
              {T(s)}
            </span>
          ))}
        </div>
        <p className="auth-foot">{T("login.foot")}</p>
      </section>

      <main className="auth-panel">
        {/* Languages sit in the top-right corner, so the first thing anyone sees is that the desk speaks five. */}
        <motion.div
          className="auth-langs"
          role="group"
          aria-label={T("lang.label")}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Globe size={16} aria-hidden="true" />
          {LANGS.map((l) => (
            <button key={l.code} type="button" aria-pressed={lang === l.code} onClick={() => changeLang(l.code)} lang={l.code} title={l.english}>
              {l.name}
            </button>
          ))}
        </motion.div>
        <motion.div
          ref={card}
          className="auth-form-wrap"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: state === "done" ? 0.4 : 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <p className="eyebrow">{T("login.welcome")}</p>
          <h1>{T("login.title")}</h1>
          <p>{T("login.sub")}</p>

          <form className="auth-form" onSubmit={submit} noValidate>
            <div className="field">
              <label className="field-label" htmlFor="login-id">
                {T("login.id")}
              </label>
              <div className="input-wrap">
                <UserRound size={18} aria-hidden="true" />
                <input
                  id="login-id"
                  className="input"
                  name="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  aria-invalid={error === "login.error" ? true : undefined}
                  aria-describedby={error ? "login-error" : undefined}
                />
              </div>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="login-password">
                {T("login.password")}
              </label>
              <div className="input-wrap">
                <KeyRound size={18} aria-hidden="true" />
                <input
                  id="login-password"
                  className="input"
                  name="password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={error === "login.error" ? true : undefined}
                  aria-describedby={error ? "login-error" : undefined}
                  style={{ paddingRight: 48 }}
                />
                <button type="button" className="icon-btn input-end" onClick={() => setShow((s) => !s)} aria-label={T(show ? "login.hide" : "login.show")} aria-pressed={show}>
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <AnimatePresence>
              {error && (
                <motion.p
                  id="login-error"
                  className="auth-error"
                  role="alert"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <CircleAlert size={18} aria-hidden="true" />
                  {T(error)}
                </motion.p>
              )}
            </AnimatePresence>

            <button ref={submitRef} type="submit" className="btn primary lg" disabled={state !== "idle"}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={state}
                  style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                >
                  {state === "busy" ? (
                    <>
                      <LoaderCircle size={18} className="spin" aria-hidden="true" />
                      {T("login.busy")}
                    </>
                  ) : state === "done" ? (
                    <>
                      <Check size={18} aria-hidden="true" />
                      {T("login.done")}
                    </>
                  ) : (
                    <>
                      {T("login.submit")}
                      <ArrowRight size={18} aria-hidden="true" />
                    </>
                  )}
                </motion.span>
              </AnimatePresence>
            </button>
          </form>

          <div className="auth-divider">{T("login.demo")}</div>
          <div className="personas" role="group" aria-label={T("login.demo")}>
            {demo.map((d, i) => (
              <motion.button
                key={d.id}
                type="button"
                className="persona"
                aria-pressed={picked === d.id}
                onClick={() => fill(d)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 + i * 0.07, duration: 0.45 }}
              >
                <Avatar user={d} />
                <span>
                  <span className="persona-name">
                    {d.name}
                    {d.best && <span className="chip brass">{T("login.demo.best")}</span>}
                  </span>
                  <span className="persona-role">
                    {roleLabel(lang, d)} · {roleCan(lang, d)}
                  </span>
                  <span className="persona-cred">
                    {d.id} <span>/</span> {d.password}
                  </span>
                </span>
                <ChevronRight size={18} aria-hidden="true" />
              </motion.button>
            ))}
          </div>

          <p className="auth-session">
            <ShieldCheck size={15} aria-hidden="true" />
            {T("login.session")}
          </p>
        </motion.div>
      </main>
    </div>
  );
}
