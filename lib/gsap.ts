"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";

// One place to register GSAP plugins, so every component gets the same setup.
gsap.registerPlugin(useGSAP, SplitText);

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export { gsap, SplitText, useGSAP };
