"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { PayPalProvider } from "@paypal/react-paypal-js/sdk-v6";
import { api, money } from "@/components/ui";
import { MilestoneCard } from "./MilestoneCard";
import { Timeline } from "./Timeline";
import type { DealView } from "./types";

type Config = { paypalClientId: string | null; paypalReady: boolean; aiReady: boolean; model: string };

export function DealRoom() {
  const { id } = useParams<{ id: string }>();
  const t = useSearchParams().get("t");
  const [view, setView] = useState<DealView | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const v = await api<DealView>(`/api/deals/${id}${t ? `?t=${t}` : ""}`);
      setView(v);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      inFlight.current = false;
    }
  }, [id, t]);

  useEffect(() => {
    const t0 = setTimeout(load, 0);
    api<Config>("/api/config").then(setConfig).catch(() => {});
    return () => clearTimeout(t0);
  }, [load]);

  const busy = view?.milestones.some((m) => m.status === "verifying" || m.status === "settling" || (m.status === "released" && m.payout_status !== "SUCCESS"));
  useEffect(() => {
    const iv = setInterval(load, busy ? 1500 : 6000);
    return () => clearInterval(iv);
  }, [load, busy]);

  const act = useCallback(
    async (milestoneId: string, action: string, body?: unknown) => {
      const p = api(`/api/deals/${id}/milestones/${milestoneId}/${action}${t ? `?t=${t}` : ""}`, body ?? {});
      // Poll while long-running actions (AI review, mediation, settlement) work server-side.
      setTimeout(load, 400);
      try {
        return await p;
      } finally {
        await load();
      }
    },
    [id, t, load],
  );

  const totals = useMemo(() => {
    if (!view) return null;
    let held = 0,
      released = 0,
      returned = 0;
    for (const m of view.milestones) {
      if (["funded", "verifying", "verified", "disputed", "settling"].includes(m.status) && m.capture_id === null) held += m.amount;
      if (m.captured_amount) released += m.captured_amount;
      if (m.status === "released" || m.status === "refunded") returned += m.amount - (m.captured_amount ?? 0);
    }
    return { held, released, returned };
  }, [view]);

  if (error && !view)
    return (
      <div className="mx-auto max-w-xl px-6 py-20 text-center">
        <h1 className="text-2xl font-bold">We couldn’t open this agreement</h1>
        <p className="mt-2 text-ink-2">{error}</p>
        <Link href="/" className="btn btn-ghost mt-6">
          Back to Fairhold
        </Link>
      </div>
    );
  if (!view) return <div className="mx-auto max-w-6xl px-6 py-16 text-ink-2">Loading agreement…</div>;

  const { deal, role } = view;
  const roleName = role === "client" ? deal.client_name : role === "freelancer" ? deal.freelancer_name : "Viewer";
  const needsPayPal = role === "client" && view.milestones.some((m) => m.status === "awaiting_funds");

  const body = (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-10">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="min-w-0">
          <p className="text-sm text-ink-2">
            {deal.client_name} hires {deal.freelancer_name}
          </p>
          <h1 className="mt-1 text-3xl sm:text-[2.1rem] font-bold tracking-tight leading-tight">{deal.title}</h1>
        </div>
        {view.links && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Switch party">
            <span className="text-sm text-ink-2 mr-1">{deal.is_demo ? "Demo: act as" : "You are"}</span>
            <Link
              href={view.links.client}
              className={`btn btn-sm ${role === "client" ? "btn-primary" : "btn-ghost"}`}
              aria-current={role === "client" ? "page" : undefined}
            >
              Client · {deal.client_name.split(" ")[0]}
            </Link>
            {deal.is_demo && (
              <Link
                href={view.links.freelancer}
                className={`btn btn-sm ${role === "freelancer" ? "btn-primary" : "btn-ghost"}`}
                aria-current={role === "freelancer" ? "page" : undefined}
              >
                Freelancer · {deal.freelancer_name.split(" ")[0]}
              </Link>
            )}
          </div>
        )}
      </div>

      {role === "viewer" && (
        <p className="mt-4 rounded-md bg-surface-2 px-3 py-2 text-sm text-ink-2">
          You’re viewing without a party link, so actions are hidden.
        </p>
      )}
      {config && (!config.paypalReady || !config.aiReady) && (
        <p className="mt-4 rounded-md bg-returned-soft px-3 py-2 text-sm text-returned">
          Server setup incomplete: {!config.paypalReady && "PayPal sandbox credentials are missing. "}
          {!config.aiReady && "No LLM key is set (GROQ_API_KEY, GEMINI_API_KEY or OPENROUTER_API_KEY)."}
        </p>
      )}

      {totals && (
        <dl className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-px overflow-hidden rounded-xl border border-line bg-line">
          {[
            ["Agreement total", money(deal.total, deal.currency), "text-ink"],
            ["Held in PayPal", money(totals.held, deal.currency), "text-held"],
            ["Released to freelancer", money(totals.released, deal.currency), "text-released"],
            ["Returned to client", money(totals.returned, deal.currency), "text-returned"],
          ].map(([k, v, c]) => (
            <div key={k} className="bg-surface px-4 py-3">
              <dt className="text-xs text-ink-2">{k}</dt>
              <dd className={`mt-1 text-xl font-bold num ${c}`}>{v}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-8 grid lg:grid-cols-[minmax(0,1fr)_340px] gap-8 items-start">
        <div className="space-y-6 min-w-0">
          {view.milestones.map((m, i) => (
            <MilestoneCard
              key={m.id}
              index={i}
              milestone={m}
              view={view}
              roleName={roleName}
              act={act}
              paypalReady={Boolean(config?.paypalClientId)}
              events={view.events.filter((e) => e.milestone_id === m.id)}
            />
          ))}
          <details className="panel p-5 text-sm">
            <summary className="cursor-pointer font-semibold">Original brief</summary>
            <p className="mt-3 text-ink-2 leading-relaxed whitespace-pre-line">{deal.brief}</p>
          </details>
        </div>
        <Timeline events={view.events} />
      </div>
    </div>
  );

  if (needsPayPal && config?.paypalClientId) {
    return (
      <PayPalProvider clientId={config.paypalClientId} environment="sandbox" components={["paypal-payments"]} pageType="checkout">
        {body}
      </PayPalProvider>
    );
  }
  return body;
}
