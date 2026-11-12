"use client";

import type { MilestoneStatus } from "@/lib/types";

export function money(n: number | null | undefined, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n ?? 0);
}

export async function api<T = unknown>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

/** Held / released / returned split of one milestone's money. */
export function SplitBar({
  amount,
  released,
  returned,
  label = true,
  currency = "USD",
}: {
  amount: number;
  released: number;
  returned: number;
  label?: boolean;
  currency?: string;
}) {
  const held = Math.max(0, amount - released - returned);
  const pct = (v: number) => `${amount > 0 ? (v / amount) * 100 : 0}%`;
  return (
    <div>
      <div
        className="split"
        role="img"
        aria-label={`${money(released, currency)} released, ${money(returned, currency)} returned, ${money(held, currency)} held`}
      >
        <span className="s-released" style={{ width: pct(released) }} />
        <span className="s-held" style={{ width: pct(held) }} />
        <span className="s-returned" style={{ width: pct(returned) }} />
      </div>
      {label && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2 num">
          <span>
            <b className="text-released">{money(released, currency)}</b> released
          </span>
          <span>
            <b className="text-held">{money(held, currency)}</b> held
          </span>
          <span>
            <b className="text-returned">{money(returned, currency)}</b> returned
          </span>
        </div>
      )}
    </div>
  );
}

const STATUS: Record<MilestoneStatus, { text: string; cls: string }> = {
  awaiting_funds: { text: "Waiting for funds", cls: "" },
  funded: { text: "Funds held", cls: "pill-held" },
  verifying: { text: "AI review in progress", cls: "pill-active working" },
  verified: { text: "Verdict ready", cls: "pill-active" },
  disputed: { text: "In mediation", cls: "pill-returned" },
  settling: { text: "Moving money", cls: "pill-active working" },
  released: { text: "Paid out", cls: "pill-released" },
  refunded: { text: "Returned to client", cls: "pill-returned" },
};

export function StatusPill({ status }: { status: MilestoneStatus }) {
  const s = STATUS[status];
  return <span className={`pill ${s.cls}`}>{s.text}</span>;
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-returned bg-returned-soft rounded-md px-3 py-2">
      {message}
    </p>
  );
}
