"use client";

import { useEffect, useState } from "react";
import { SplitBar, money } from "./ui";

const CRITERIA: { text: string; w: number; outcome: "met" | "partial" | "unmet" }[] = [
  { text: "Title and heading name “Bloom & Rye”", w: 3, outcome: "met" },
  { text: "Opening hours for all seven days", w: 3, outcome: "met" },
  { text: "Contact form with required name, email, message", w: 4, outcome: "unmet" },
  { text: "Viewport meta and a responsive @media rule", w: 3, outcome: "met" },
  { text: "Every image has descriptive alt text", w: 2, outcome: "partial" },
  { text: "CTA buttons use brand green #2f6b4f", w: 2, outcome: "met" },
];
const AMOUNT = 240;
const RELEASED = 169.41;

/** The one orchestrated motion on the page: a hold being checked and settled. */
export function HeroCard() {
  const [step, setStep] = useState(0); // 0..6 criteria revealed, 7 settled
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      const t0 = setTimeout(() => setStep(7), 0);
      return () => clearTimeout(t0);
    }
    let s = 0;
    const t = setInterval(() => {
      s += 1;
      setStep(s);
      if (s >= 7) clearInterval(t);
    }, 650);
    return () => clearInterval(t);
  }, []);
  const settled = step >= 7;

  return (
    <div className="panel p-5 sm:p-6 shadow-[0_1px_0_var(--line),0_24px_48px_-24px_rgba(27,30,60,0.25)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-ink-2">Milestone 1 of 2</p>
          <p className="font-semibold text-lg leading-snug">Responsive landing page</p>
        </div>
        <span className={`pill ${settled ? "pill-released" : "pill-active working"}`}>
          {settled ? "Paid out" : "AI review in progress"}
        </span>
      </div>
      <ul className="mt-4 space-y-2 text-sm">
        {CRITERIA.map((c, i) => {
          const shown = step > i;
          const mark = c.outcome === "met" ? "✓" : c.outcome === "partial" ? "½" : "✕";
          const color = c.outcome === "met" ? "text-released" : c.outcome === "partial" ? "text-held" : "text-returned";
          return (
            <li key={c.text} className="flex items-start gap-3">
              <span
                className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[0.7rem] font-bold transition-colors ${
                  shown ? `${color} border-current` : "border-line text-transparent"
                }`}
                aria-hidden="true"
              >
                {mark}
              </span>
              <span className={shown ? "text-ink" : "text-ink-3"}>{c.text}</span>
              <span className="ml-auto text-xs text-ink-3 num">×{c.w}</span>
            </li>
          );
        })}
      </ul>
      <div className="mt-5">
        <SplitBar amount={AMOUNT} released={settled ? RELEASED : 0} returned={settled ? AMOUNT - RELEASED : 0} />
      </div>
      <p className="mt-4 text-sm text-ink-2 min-h-[2.5rem]">
        {settled
          ? `12 of 17 weighted points met. ${money(RELEASED)} captured and paid to Leo; ${money(AMOUNT - RELEASED)} never left Maya’s account.`
          : `${money(AMOUNT)} is held in Maya’s PayPal account while the work is checked.`}
      </p>
    </div>
  );
}
