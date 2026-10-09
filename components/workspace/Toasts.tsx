"use client";

import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { Toast } from "./types";

const ICON = { success: CircleCheck, info: Info, error: CircleAlert };

export default function Toasts({ toasts, closeLabel, onDismiss }: { toasts: Toast[]; closeLabel: string; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" aria-live="polite" role="status">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = ICON[t.tone];
          return (
            <motion.div
              key={t.id}
              layout
              className={`toast ${t.tone}`}
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
            >
              <Icon size={19} aria-hidden="true" />
              <span style={{ flex: 1 }}>{t.text}</span>
              <button onClick={() => onDismiss(t.id)} aria-label={closeLabel} style={{ color: "#9fb0a8", display: "grid" }}>
                <X size={16} aria-hidden="true" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
