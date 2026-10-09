"use client";

import { Brain, Eye, FileSignature, MessageSquareText, RefreshCw, Scale, Target } from "lucide-react";
import { useInView } from "motion/react";
import { useRef } from "react";
import { CountUp, tRich } from "@/components/ui";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";
import { type Key, type Lang, num, t } from "@/lib/i18n";

type Step = { name: Key; what: Key; n: number };

const ICONS = [Eye, Brain, Scale, Target, FileSignature, MessageSquareText];
const DURATION = 1.8;

/**
 * The six steps the desk ran this morning. When the band scrolls into view a
 * GSAP timeline fills the track and lights each step in turn while its number
 * counts up. Remount it (new key) to replay, which is what "Check again" does.
 */
export default function AgentLoop({ lang, steps, onRecheck }: { lang: Lang; steps: Step[]; onRecheck: () => void }) {
  const scope = useRef<HTMLElement>(null);
  const reduce = prefersReducedMotion();
  const inView = useInView(scope, { once: true, amount: 0.35 });

  useGSAP(
    () => {
      const root = scope.current;
      if (!root || !inView) return;
      const track = root.querySelector<HTMLElement>(".loop-steps");
      const nodes = gsap.utils.toArray<HTMLElement>(".loop-step", root);
      if (!track) return;
      if (prefersReducedMotion()) {
        track.style.setProperty("--p", "1");
        nodes.forEach((n) => n.classList.add("on"));
        return;
      }
      const tl = gsap.timeline({ delay: 0.15 });
      tl.fromTo(track, { "--p": 0 }, { "--p": 1, duration: DURATION, ease: "power1.inOut" }, 0);
      nodes.forEach((n, i) => {
        const at = (i / (nodes.length - 1)) * DURATION;
        tl.call(() => n.classList.add("on"), [], at);
        tl.fromTo(n.querySelector(".loop-node"), { scale: 0.7 }, { scale: 1, duration: 0.6, ease: "back.out(2.4)" }, at);
        tl.fromTo(n.querySelectorAll(".loop-name, .loop-what"), { opacity: 0.35 }, { opacity: 1, duration: 0.4 }, at);
      });
    },
    { scope, dependencies: [inView] },
  );

  return (
    <section className="card loop" ref={scope} aria-labelledby="loop-title">
      <div className="loop-head">
        <h2 className="card-title" id="loop-title">
          {t(lang, "today.loop")}
        </h2>
        <div className="loop-head-right">
          <button className="btn sm" onClick={onRecheck}>
            <RefreshCw size={14} aria-hidden="true" />
            {t(lang, "brief.recheck")}
          </button>
        </div>
      </div>
      <div className="loop-steps">
        <span className="loop-track" aria-hidden="true" />
        <span className="loop-fill" aria-hidden="true" />
        <ol className="loop-list">
        {steps.map((s, i) => {
          const Icon = ICONS[i];
          const at = 0.15 + (i / (steps.length - 1)) * DURATION;
          return (
            <li key={s.name} className="loop-step">
              <span className="loop-node" aria-hidden="true">
                <Icon />
              </span>
              <span className="loop-name">{t(lang, s.name)}</span>
              <span className="loop-what">
                {tRich(lang, s.what, { n: <b>{reduce ? num(s.n) : <CountUp value={inView ? s.n : 0} format={num} delay={at} />}</b> })}
              </span>
            </li>
          );
        })}
        </ol>
      </div>
    </section>
  );
}
