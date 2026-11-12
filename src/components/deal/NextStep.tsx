"use client";

import { useState } from "react";
import { money } from "@/components/ui";
import type { DealView } from "./types";

/** One plain-language "what happens now" line for whoever is looking at the agreement. */
export function NextStep({ view }: { view: DealView }) {
  const { deal, role, milestones, links } = view;
  const [copied, setCopied] = useState(false);
  const cur = deal.currency;
  const leo = deal.freelancer_name.split(" ")[0];
  const maya = deal.client_name.split(" ")[0];
  const idx = milestones.findIndex((m) => m.status !== "released" && m.status !== "refunded");
  const m = idx >= 0 ? milestones[idx] : null;
  const n = idx + 1;

  const jump = () => m && document.getElementById(`ms-${m.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const freelancerUrl = links ? `${typeof window !== "undefined" ? window.location.origin : ""}${links.freelancer}` : null;

  let title = "";
  let body = "";
  let showFreelancerLink = false;
  let tone = "bg-surface border-line";

  if (!m) {
    const paid = milestones.reduce((s, x) => s + (x.payout_amount ?? 0), 0);
    const kept = milestones.reduce((s, x) => s + (x.amount - (x.captured_amount ?? 0)), 0);
    title = "All milestones are settled";
    body = `${leo} was paid ${money(paid, cur)}. ${money(kept, cur)} was never charged to ${maya}.`;
    tone = "bg-released-soft border-transparent";
  } else if (m.status === "awaiting_funds") {
    title = role === "client" ? `Next: fund milestone ${n} with PayPal` : `Waiting for ${maya} to fund milestone ${n}`;
    body =
      role === "client"
        ? "The money is only held on your PayPal account, not charged, until the work is verified."
        : "Don't start work until the funds show as held.";
  } else if (m.status === "funded") {
    if (role === "freelancer") {
      title = `Next: submit your work for milestone ${n}`;
      body = "Add a link to the live work (or a repo or image). The AI reviewer checks it against the agreed criteria.";
    } else {
      title = `Next: ${leo} delivers milestone ${n}`;
      body = `${money(m.amount, cur)} is held. ${leo} submits the work from their own link${deal.is_demo ? " (switch to the Freelancer view above)" : ""}.`;
      showFreelancerLink = role === "client" && !deal.is_demo;
    }
    tone = "bg-held-soft border-transparent";
  } else if (m.status === "verifying") {
    title = `The AI reviewer is checking milestone ${n}`;
    body = "It opens each submitted link and rates every criterion with evidence. This takes a few seconds.";
  } else if (m.status === "verified" && m.verdict) {
    const amt = money(m.verdict.payoutAmount, cur);
    if (role === "client") {
      title = `Next: release ${amt} for milestone ${n}, or object`;
      body = `The reviewer scored it ${Math.round(m.verdict.score * 100)}%. Release pays ${leo} that share; the rest of the hold is never charged.`;
    } else {
      title = `Verdict ready: ${amt} proposed for milestone ${n}`;
      body = `${maya} can release it now. You can also fix and resubmit, or object.${deal.is_demo ? " Switch to the Client view to release." : ""}`;
    }
  } else if (m.status === "disputed") {
    title = `Milestone ${n} is in mediation`;
    body = "Both sides can add a statement, then either side asks the mediator to rule.";
  } else if (m.status === "settling") {
    title = "Moving money through PayPal";
    body = "Capturing the earned share and sending the payout.";
  }

  return (
    <section className={`mt-6 rounded-xl border px-4 py-3 sm:px-5 sm:py-4 ${tone}`} aria-live="polite">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="min-w-0">
          <p className="font-semibold">{title}</p>
          <p className="text-sm text-ink-2 mt-0.5">{body}</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {showFreelancerLink && freelancerUrl && (
            <>
              <button
                className="btn btn-ghost btn-sm bg-surface"
                onClick={() => {
                  navigator.clipboard.writeText(freelancerUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? "Copied" : `Copy ${leo}’s link`}
              </button>
              <a className="btn btn-primary btn-sm" href={freelancerUrl} target="_blank" rel="noreferrer">
                Open {leo}’s view
              </a>
            </>
          )}
          {m && m.status !== "settling" && (
            <button className="btn btn-ghost btn-sm bg-surface" onClick={jump}>
              Go to milestone {n}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
