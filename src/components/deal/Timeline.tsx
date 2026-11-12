"use client";

import type { DealEvent } from "@/lib/types";

const TONE: Record<string, string> = {
  "funds.held": "bg-held",
  "funds.captured": "bg-released",
  "payout.sent": "bg-released",
  "payout.completed": "bg-released",
  "funds.returned": "bg-returned",
  "dispute.opened": "bg-returned",
  "ai.verdict": "bg-accent",
  "ai.ruling": "bg-accent",
  "ai.error": "bg-returned",
  "settle.error": "bg-returned",
};

export function Timeline({ events }: { events: DealEvent[] }) {
  const visible = events.filter((e) => e.kind !== "ai.step");
  return (
    <aside className="panel p-5 lg:sticky lg:top-20" aria-label="Activity">
      <h2 className="font-semibold">Activity</h2>
      <p className="text-xs text-ink-3 mt-0.5">Every hold, verdict and payment, newest first.</p>
      <ol className="mt-4 space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {visible.map((e) => (
          <li key={e.id} className="flex gap-3">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE[e.kind] ?? "bg-ink-3"}`} aria-hidden="true" />
            <div className="min-w-0 text-sm">
              <p className="leading-snug">{e.message}</p>
              <p className="mt-0.5 text-xs text-ink-3">
                {e.actor} · {new Date(e.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </p>
            </div>
          </li>
        ))}
        {visible.length === 0 && <li className="text-sm text-ink-2">Nothing has happened yet.</li>}
      </ol>
    </aside>
  );
}
