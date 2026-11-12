"use client";

import { useState } from "react";
import { PayPalOneTimePaymentButton } from "@paypal/react-paypal-js/sdk-v6";
import { SplitBar, StatusPill, money, Spinner, ErrorNote } from "@/components/ui";
import type { CriterionResult, DealEvent, Milestone } from "@/lib/types";
import type { ActionFn, DealView } from "./types";
import { SubmitForm } from "./SubmitForm";

function Mark({ r }: { r?: CriterionResult }) {
  if (!r) return <span className="mt-0.5 inline-block h-5 w-5 shrink-0 rounded-full border border-line" aria-hidden="true" />;
  const map = {
    met: ["✓", "text-released"],
    partial: ["½", "text-held"],
    unmet: ["✕", "text-returned"],
  } as const;
  const [ch, cls] = map[r.outcome];
  return (
    <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[0.7rem] font-bold ${cls}`}>
      <span aria-hidden="true">{ch}</span>
      <span className="sr-only">{r.outcome}</span>
    </span>
  );
}

export function MilestoneCard({
  index,
  milestone: m,
  view,
  act,
  paypalReady,
  events,
}: {
  index: number;
  milestone: Milestone;
  view: DealView;
  roleName: string;
  act: ActionFn;
  paypalReady: boolean;
  events: DealEvent[];
}) {
  const { deal, role } = view;
  const cur = deal.currency;
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<"idle" | "resubmit" | "object">("idle");
  const [text, setText] = useState("");

  const run = async (action: string, body?: unknown) => {
    setBusy(action);
    setErr(null);
    try {
      await act(m.id, action, body);
      setMode("idle");
      setText("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const settled = m.status === "released" || m.status === "refunded";
  const released = m.captured_amount ?? 0;
  const returned = settled ? m.amount - released : 0;
  const steps = events.filter((e) => e.kind === "ai.step").slice(0, 8).reverse();
  const totalWeight = m.criteria.reduce((s, c) => s + c.weight, 0);

  return (
    <article className="panel overflow-hidden" aria-labelledby={`ms-${m.id}`}>
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-ink-2 num">Milestone {index + 1}</p>
            <h2 id={`ms-${m.id}`} className="text-xl font-semibold leading-snug scroll-mt-24">
              {m.title}
            </h2>
            <p className="mt-1 text-sm text-ink-2">{m.summary}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-2xl font-bold num">{money(m.amount, cur)}</p>
            <div className="mt-1">
              <StatusPill status={m.status} />
            </div>
          </div>
        </div>

        <div className="mt-5">
          {m.status === "awaiting_funds" ? (
            <div className="split border-dashed" aria-label="Not funded yet" role="img" />
          ) : (
            <SplitBar amount={m.amount} released={released} returned={returned} currency={cur} />
          )}
          {m.auth_expires_at && !settled && (
            <p className="mt-2 text-xs text-ink-3">
              PayPal authorization valid until {new Date(m.auth_expires_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </p>
          )}
        </div>

        <div className="mt-6">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold">Acceptance criteria</h3>
            {m.verdict && (
              <p className="text-sm text-ink-2 num">
                Score <b className="text-ink">{Math.round(m.verdict.score * 100)}%</b> of {totalWeight} weighted points
              </p>
            )}
          </div>
          <ul className="mt-3 divide-y divide-line">
            {m.criteria.map((c) => {
              const r = m.verdict?.results.find((x) => x.id === c.id);
              return (
                <li key={c.id} className="py-2.5 flex items-start gap-3 text-sm">
                  <Mark r={r} />
                  <div className="min-w-0 flex-1">
                    <p>{c.text}</p>
                    {r && (
                      <details className="mt-1 group">
                        <summary className="cursor-pointer text-xs text-ink-2 hover:text-ink">Evidence</summary>
                        <p className="mt-1 text-xs text-ink-2 leading-relaxed">
                          <span className="text-ink">{r.evidence}</span> {r.reasoning}
                        </p>
                      </details>
                    )}
                  </div>
                  <span className="text-xs text-ink-3 num shrink-0">×{c.weight}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* ---------- Action area ---------- */}
      <div className="border-t border-line bg-surface-2/50 p-5 sm:p-6 space-y-4">
        {m.status === "awaiting_funds" &&
          (role === "client" ? (
            <div className="grid sm:grid-cols-[1fr_auto] gap-4 items-center">
              <div className="text-sm text-ink-2">
                <p className="text-ink font-semibold">Hold {money(m.amount, cur)} for this milestone</p>
                <p className="mt-1">
                  PayPal reserves the money on your account. Nothing is charged until the work is verified, and only the earned share
                  is ever captured.
                </p>
              </div>
              <div className="w-full sm:w-64">
                {paypalReady ? (
                  <PayPalOneTimePaymentButton
                    presentationMode="auto"
                    createOrder={async () => {
                      const r = (await act(m.id, "order")) as { orderId: string };
                      return { orderId: r.orderId };
                    }}
                    onApprove={async ({ orderId }: { orderId: string }) => {
                      await run("authorize", { orderId });
                    }}
                    onError={(e: unknown) => setErr(`PayPal: ${(e as Error)?.message ?? "checkout failed"}`)}
                  />
                ) : (
                  <p className="text-sm text-returned">PayPal client ID is not configured.</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-2">Waiting for {deal.client_name} to place the hold. Don’t start work until the funds are held.</p>
          ))}

        {m.status === "funded" &&
          (role === "freelancer" ? (
            <SubmitForm attempts={m.attempts} onSubmit={(body) => run("submit", body)} busy={busy === "submit"} />
          ) : (
            <p className="text-sm text-ink-2">
              {money(m.amount, cur)} is held. Waiting for {deal.freelancer_name} to deliver.
              {m.attempts > 0 && " They are revising after the last review."}
            </p>
          ))}

        {m.status === "verifying" && (
          <div aria-live="polite">
            <p className="flex items-center gap-2 font-semibold">
              <Spinner className="text-accent" /> The verifier is checking the work
            </p>
            <ol className="mt-3 space-y-1.5 text-sm text-ink-2">
              {steps.map((s) => (
                <li key={s.id} className="flex gap-2">
                  <span className="text-ink-3">•</span>
                  {s.message}
                </li>
              ))}
            </ol>
          </div>
        )}

        {m.status === "verified" && m.verdict && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-5 items-start">
              <div
                className="h-20 w-20 shrink-0 rounded-full border-[3px] border-accent flex flex-col items-center justify-center text-accent"
                aria-label={`Score ${Math.round(m.verdict.score * 100)} percent`}
              >
                <span className="text-2xl font-extrabold num leading-none">{Math.round(m.verdict.score * 100)}</span>
                <span className="text-[0.65rem] font-semibold">percent</span>
              </div>
              <div className="flex-1 min-w-56">
                <p className="font-semibold">
                  Proposed release: <span className="num text-released">{money(m.verdict.payoutAmount, cur)}</span> of {money(m.amount, cur)}
                </p>
                <p className="mt-1 text-sm text-ink-2 leading-relaxed">{m.verdict.summary}</p>
                <p className="mt-2 text-xs text-ink-3">
                  If nobody objects within 72 hours, Fairhold releases this amount automatically.
                </p>
              </div>
            </div>

            {mode === "idle" && (
              <div className="flex flex-wrap gap-2">
                {role === "client" && (
                  <button className="btn btn-release" disabled={busy !== null} onClick={() => run("accept")}>
                    {busy === "accept" && <Spinner />}
                    {m.verdict.payoutAmount > 0 ? `Release ${money(m.verdict.payoutAmount, cur)}` : "Cancel the hold"}
                  </button>
                )}
                {role === "freelancer" && (
                  <button className="btn btn-primary" disabled={busy !== null} onClick={() => setMode("resubmit")}>
                    Fix and resubmit
                  </button>
                )}
                {(role === "client" || role === "freelancer") && (
                  <button className="btn btn-ghost" disabled={busy !== null} onClick={() => setMode("object")}>
                    Object to this verdict
                  </button>
                )}
              </div>
            )}
            {mode === "resubmit" && role === "freelancer" && (
              <SubmitForm attempts={m.attempts} onSubmit={(body) => run("submit", body)} busy={busy === "submit"} onCancel={() => setMode("idle")} initial={m.submission} />
            )}
            {mode === "object" && (
              <div className="space-y-2">
                <label className="label" htmlFor={`obj-${m.id}`}>
                  What did the verifier get wrong?
                </label>
                <textarea id={`obj-${m.id}`} className="field min-h-24" value={text} onChange={(e) => setText(e.target.value)} />
                <div className="flex gap-2">
                  <button className="btn btn-primary" disabled={busy !== null || text.trim().length < 15} onClick={() => run("dispute", { text })}>
                    {busy === "dispute" && <Spinner />}
                    Send to mediation
                  </button>
                  <button className="btn btn-ghost" onClick={() => setMode("idle")}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {m.status === "disputed" && m.dispute && (
          <div className="space-y-4">
            <p className="font-semibold">In mediation. The held funds stay put until the mediator rules.</p>
            <ul className="space-y-3">
              {m.dispute.statements.map((s, i) => (
                <li key={i} className="rounded-lg bg-surface border border-line p-3 text-sm">
                  <p className="text-xs font-semibold text-ink-2">{s.by === "client" ? deal.client_name : deal.freelancer_name}</p>
                  <p className="mt-1 leading-relaxed">{s.text}</p>
                </li>
              ))}
            </ul>
            {busy === "rule" ? (
              <div aria-live="polite">
                <p className="flex items-center gap-2 font-semibold">
                  <Spinner className="text-accent" /> The mediator is reviewing the case
                </p>
                <ol className="mt-2 space-y-1 text-sm text-ink-2">
                  {steps.map((s) => (
                    <li key={s.id}>• {s.message}</li>
                  ))}
                </ol>
              </div>
            ) : (
              (role === "client" || role === "freelancer") && (
                <div className="space-y-2">
                  {!m.dispute.statements.some((s) => s.by === role) && (
                    <>
                      <label className="label" htmlFor={`st-${m.id}`}>
                        Your side
                      </label>
                      <textarea id={`st-${m.id}`} className="field min-h-20" value={text} onChange={(e) => setText(e.target.value)} />
                      <button className="btn btn-ghost" disabled={busy !== null || text.trim().length < 15} onClick={() => run("statement", { text })}>
                        Add my statement
                      </button>
                    </>
                  )}
                  <div>
                    <button className="btn btn-primary" disabled={busy !== null} onClick={() => run("rule")}>
                      Ask the mediator to rule
                    </button>
                    <p className="mt-2 text-xs text-ink-3">The ruling is final within Fairhold and is executed immediately.</p>
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {m.status === "settling" && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex items-center gap-2 font-semibold">
              <Spinner className="text-accent" /> Capturing and paying out through PayPal
            </p>
            {m.capture_id && !m.payout_batch_id && busy === null && (role === "client" || role === "freelancer") && (
              <button className="btn btn-ghost btn-sm" onClick={() => run("retry-payout")}>
                Retry payout
              </button>
            )}
          </div>
        )}

        {settled && (
          <div className="space-y-3">
            {m.ruling && (
              <div className="rounded-lg bg-surface border border-line p-4 text-sm">
                <p className="font-semibold">
                  Mediator ruling: {m.ruling.percentToFreelancer}% to {deal.freelancer_name}
                </p>
                <p className="mt-1 text-ink-2 leading-relaxed">{m.ruling.rationale}</p>
                <ul className="mt-2 list-disc pl-5 text-ink-2 space-y-0.5">
                  {m.ruling.findings.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                {m.ruling.paypalChecks.length > 0 && <p className="mt-2 text-xs text-ink-3">Verified with PayPal: {m.ruling.paypalChecks.length} lookup(s)</p>}
              </div>
            )}
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <dt className="text-ink-2 text-xs">Captured</dt>
                <dd className="font-semibold num">{money(released, cur)}</dd>
              </div>
              <div>
                <dt className="text-ink-2 text-xs">Platform fee ({view.feePercent}%)</dt>
                <dd className="font-semibold num">{money(m.fee_amount, cur)}</dd>
              </div>
              <div>
                <dt className="text-ink-2 text-xs">Paid to {deal.freelancer_name.split(" ")[0]}</dt>
                <dd className="font-semibold num text-released">{money(m.payout_amount, cur)}</dd>
              </div>
              <div>
                <dt className="text-ink-2 text-xs">Never charged</dt>
                <dd className="font-semibold num text-returned">{money(returned, cur)}</dd>
              </div>
            </dl>
            <p className="text-xs text-ink-3 font-mono break-all">
              order {m.paypal_order_id} · auth {m.authorization_id}
              {m.capture_id && ` · capture ${m.capture_id}`}
              {m.payout_batch_id && ` · payout ${m.payout_batch_id} (${m.payout_status?.toLowerCase()})`}
            </p>
          </div>
        )}

        <ErrorNote message={err} />
      </div>
    </article>
  );
}
