"use client";

import { useState } from "react";
import Link from "next/link";
import { api, money, Spinner, ErrorNote } from "@/components/ui";
import type { Criterion, MilestoneDraft } from "@/lib/types";
import { DEMO_BRIEF } from "@/lib/demo";

const CHECKS: { value: Criterion["check"]; label: string }[] = [
  { value: "page", label: "Live web page" },
  { value: "repo", label: "GitHub repo" },
  { value: "image", label: "Image upload" },
  { value: "text", label: "Written notes" },
];

export default function NewAgreement() {
  const [brief, setBrief] = useState("");
  const [budget, setBudget] = useState("400");
  const [title, setTitle] = useState("");
  const [milestones, setMilestones] = useState<MilestoneDraft[] | null>(null);
  const [risks, setRisks] = useState<string[]>([]);
  const [clientName, setClientName] = useState("");
  const [freelancerName, setFreelancerName] = useState("");
  const [freelancerEmail, setFreelancerEmail] = useState("");
  const [busy, setBusy] = useState<"scope" | "create" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<{ dealId: string; clientToken: string; freelancerToken: string } | null>(null);

  const total = milestones?.reduce((s, m) => s + (Number(m.amount) || 0), 0) ?? 0;

  async function draft() {
    setErr(null);
    setBusy("scope");
    try {
      const r = await api<{ title: string; milestones: MilestoneDraft[]; risks: string[] }>("/api/scope", {
        brief,
        budget: Number(budget),
        currency: "USD",
      });
      setTitle(r.title);
      setMilestones(r.milestones);
      setRisks(r.risks);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    if (!milestones) return;
    setErr(null);
    setBusy("create");
    try {
      const r = await api<{ dealId: string; clientToken: string; freelancerToken: string }>("/api/deals", {
        title,
        brief,
        currency: "USD",
        clientName,
        freelancerName,
        freelancerEmail,
        milestones: milestones.map((m) => ({ ...m, amount: Number(m.amount) })),
      });
      setCreated(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const updateMs = (i: number, patch: Partial<MilestoneDraft>) =>
    setMilestones((ms) => ms!.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const updateCrit = (i: number, k: number, patch: Partial<Criterion>) =>
    updateMs(i, { criteria: milestones![i].criteria.map((c, j) => (j === k ? { ...c, ...patch } : c)) });

  if (created) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const freelancerLink = `${origin}/deal/${created.dealId}?t=${created.freelancerToken}`;
    return (
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-16">
        <h1 className="text-3xl font-bold tracking-tight">Agreement created</h1>
        <p className="mt-3 text-ink-2">
          Send the freelancer their link. Each link is private to one party, so keep yours to yourself.
        </p>
        <div className="panel p-5 mt-8 space-y-4">
          <div>
            <p className="label">Freelancer’s link</p>
            <div className="flex gap-2">
              <input readOnly className="field font-mono text-xs" value={freelancerLink} />
              <button className="btn btn-ghost btn-sm h-auto" onClick={() => navigator.clipboard.writeText(freelancerLink)}>
                Copy
              </button>
            </div>
          </div>
          <Link href={`/deal/${created.dealId}?t=${created.clientToken}`} className="btn btn-primary w-full">
            Open my agreement and fund milestone 1
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">New agreement</h1>
      <p className="mt-2 text-ink-2">Describe the job the way you’d explain it to a friend. Fairhold drafts the acceptance criteria.</p>

      <section className="panel p-5 sm:p-6 mt-8">
        <label className="label" htmlFor="brief">
          What do you need done?
        </label>
        <textarea
          id="brief"
          className="field min-h-36 leading-relaxed"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="e.g. A one-page website for my bakery with opening hours, a menu with prices, and a contact form…"
        />
        <button type="button" className="mt-2 text-sm text-accent hover:underline" onClick={() => setBrief(DEMO_BRIEF)}>
          Use the bakery example
        </button>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="w-40">
            <label className="label" htmlFor="budget">
              Budget (USD)
            </label>
            <input
              id="budget"
              className="field num"
              inputMode="decimal"
              value={budget}
              onChange={(e) => setBudget(e.target.value.replace(/[^0-9.]/g, ""))}
            />
          </div>
          <button className="btn btn-primary" disabled={busy !== null || brief.trim().length < 20 || !Number(budget)} onClick={draft}>
            {busy === "scope" && <Spinner />}
            {milestones ? "Redraft criteria" : "Draft acceptance criteria"}
          </button>
        </div>
        {busy === "scope" && <p className="mt-3 text-sm text-ink-2">Splitting the job into milestones and checkable criteria…</p>}
      </section>

      {milestones && (
        <>
          <section className="mt-8">
            <label className="label" htmlFor="title">
              Agreement title
            </label>
            <input id="title" className="field text-lg font-semibold" value={title} onChange={(e) => setTitle(e.target.value)} />
            {risks.length > 0 && (
              <div className="mt-4 rounded-lg bg-held-soft p-4 text-sm">
                <p className="font-semibold text-ink">Settle these with the freelancer before you fund</p>
                <ul className="mt-2 list-disc pl-5 space-y-1 text-ink-2">
                  {risks.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <ol className="mt-6 space-y-5">
            {milestones.map((m, i) => (
              <li key={i} className="panel p-5 sm:p-6">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="mt-2 text-sm font-bold text-ink-3 num">Milestone {i + 1}</span>
                  <input
                    aria-label={`Milestone ${i + 1} title`}
                    className="field flex-1 min-w-48 font-semibold"
                    value={m.title}
                    onChange={(e) => updateMs(i, { title: e.target.value })}
                  />
                  <div className="w-32">
                    <input
                      aria-label={`Milestone ${i + 1} amount`}
                      className="field num text-right"
                      value={String(m.amount)}
                      onChange={(e) => updateMs(i, { amount: e.target.value.replace(/[^0-9.]/g, "") as unknown as number })}
                    />
                  </div>
                </div>
                <input
                  aria-label={`Milestone ${i + 1} summary`}
                  className="field mt-3 text-sm"
                  value={m.summary}
                  onChange={(e) => updateMs(i, { summary: e.target.value })}
                />
                <p className="label mt-5">Acceptance criteria and weight</p>
                <ul className="space-y-2">
                  {m.criteria.map((c, k) => (
                    <li key={k} className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
                      <input
                        aria-label="Criterion"
                        className="field text-sm flex-1 min-w-56"
                        value={c.text}
                        onChange={(e) => updateCrit(i, k, { text: e.target.value })}
                      />
                      <select
                        aria-label="Evidence type"
                        className="field text-sm w-36"
                        value={c.check}
                        onChange={(e) => updateCrit(i, k, { check: e.target.value as Criterion["check"] })}
                      >
                        {CHECKS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Weight"
                        className="field text-sm w-20 num"
                        value={c.weight}
                        onChange={(e) => updateCrit(i, k, { weight: Number(e.target.value) })}
                      >
                        {[1, 2, 3, 4, 5].map((w) => (
                          <option key={w} value={w}>
                            ×{w}
                          </option>
                        ))}
                      </select>
                      <button
                        className="btn btn-ghost btn-sm"
                        aria-label="Remove criterion"
                        disabled={m.criteria.length <= 1}
                        onClick={() => updateMs(i, { criteria: m.criteria.filter((_, j) => j !== k) })}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  className="mt-3 text-sm text-accent hover:underline"
                  onClick={() =>
                    updateMs(i, { criteria: [...m.criteria, { id: `c${m.criteria.length + 1}`, text: "", weight: 2, check: m.criteria[0]?.check ?? "page" }] })
                  }
                >
                  Add a criterion
                </button>
              </li>
            ))}
          </ol>

          <section className="panel p-5 sm:p-6 mt-8">
            <h2 className="font-semibold text-lg">Who is involved</h2>
            <div className="mt-4 grid sm:grid-cols-3 gap-4">
              <div>
                <label className="label" htmlFor="cn">
                  Your name
                </label>
                <input id="cn" className="field" value={clientName} onChange={(e) => setClientName(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="fn">
                  Freelancer’s name
                </label>
                <input id="fn" className="field" value={freelancerName} onChange={(e) => setFreelancerName(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="fe">
                  Freelancer’s PayPal email
                </label>
                <input
                  id="fe"
                  type="email"
                  className="field"
                  value={freelancerEmail}
                  onChange={(e) => setFreelancerEmail(e.target.value)}
                  placeholder="sandbox personal account"
                />
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5">
              <p className="text-ink-2">
                Total <b className="text-ink text-lg num">{money(total)}</b> across {milestones.length} milestone
                {milestones.length > 1 ? "s" : ""}
              </p>
              <button
                className="btn btn-primary"
                disabled={busy !== null || !clientName || !freelancerName || !freelancerEmail.includes("@") || !title}
                onClick={create}
              >
                {busy === "create" && <Spinner />}
                Create agreement
              </button>
            </div>
          </section>
        </>
      )}
      <div className="mt-4">
        <ErrorNote message={err} />
      </div>
    </div>
  );
}
