"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type ICellRendererParams } from "ag-grid-community";
import { api, money, StatusPill, Spinner } from "@/components/ui";
import type { Milestone } from "@/lib/types";

ModuleRegistry.registerModules([AllCommunityModule]);

type Row = Milestone & { deal_title: string; currency: string; client_name: string; freelancer_name: string };
type Msg = { role: "user" | "assistant"; content: string; tools?: string[] };

const gridTheme = themeQuartz.withParams({
  backgroundColor: "var(--surface)",
  foregroundColor: "var(--ink)",
  borderColor: "var(--line)",
  headerBackgroundColor: "var(--surface-2)",
  headerTextColor: "var(--ink-2)",
  accentColor: "var(--accent)",
  oddRowBackgroundColor: "var(--surface)",
  rowHoverColor: "var(--surface-2)",
  fontFamily: "var(--font-schibsted), system-ui, sans-serif",
  fontSize: 13,
  headerFontWeight: 600,
  wrapperBorderRadius: 12,
});

const PROMPTS = [
  "How much money is held right now, and for which milestones?",
  "Match recent PayPal transactions to Fairhold captures and flag anything that doesn't line up.",
  "Which milestones were paid out partially, and why?",
  "Are there any open PayPal disputes?",
];

const released = (r: Row) => r.captured_amount ?? 0;
const returned = (r: Row) => (r.status === "released" || r.status === "refunded" ? r.amount - (r.captured_amount ?? 0) : 0);

export default function Ops() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = () =>
      api<{ rows: Row[] }>("/api/ledger")
        .then((r) => setRows(r.rows))
        .catch((e) => setErr(e.message));
    load();
    const iv = setInterval(load, 10_000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), [msgs, thinking]);

  const kpis = useMemo(() => {
    const r = rows ?? [];
    const held = r.filter((x) => ["funded", "verifying", "verified", "disputed"].includes(x.status)).reduce((s, x) => s + x.amount, 0);
    const rel = r.reduce((s, x) => s + released(x), 0);
    const ret = r.reduce((s, x) => s + returned(x), 0);
    const fees = r.reduce((s, x) => s + (x.fee_amount ?? 0), 0);
    const scored = r.filter((x) => x.verdict);
    const avg = scored.length ? scored.reduce((s, x) => s + (x.verdict?.score ?? 0), 0) / scored.length : 0;
    return { held, rel, ret, fees, avg, scored: scored.length };
  }, [rows]);

  const cols = useMemo<ColDef<Row>[]>(
    () => [
      { field: "deal_title", headerName: "Agreement", minWidth: 190, flex: 1.4, filter: true },
      { field: "title", headerName: "Milestone", minWidth: 170, flex: 1.2, filter: true },
      {
        field: "status",
        headerName: "Status",
        width: 175,
        filter: true,
        cellRenderer: (p: ICellRendererParams<Row>) => (p.data ? <StatusPill status={p.data.status} /> : null),
      },
      { field: "amount", headerName: "Held", width: 105, type: "rightAligned", valueFormatter: (p) => money(p.value, p.data?.currency) },
      {
        headerName: "AI score",
        width: 110,
        type: "rightAligned",
        valueGetter: (p) => (p.data?.verdict ? Math.round(p.data.verdict.score * 100) : null),
        valueFormatter: (p) => (p.value === null ? "—" : `${p.value}%`),
      },
      {
        headerName: "Released",
        width: 115,
        type: "rightAligned",
        valueGetter: (p) => (p.data ? released(p.data) : 0),
        valueFormatter: (p) => money(p.value, p.data?.currency),
        cellClass: "text-released font-semibold",
      },
      {
        headerName: "Returned",
        width: 110,
        type: "rightAligned",
        valueGetter: (p) => (p.data ? returned(p.data) : 0),
        valueFormatter: (p) => money(p.value, p.data?.currency),
        cellClass: "text-returned",
      },
      { field: "fee_amount", headerName: "Fee", width: 90, type: "rightAligned", valueFormatter: (p) => money(p.value, p.data?.currency) },
      { field: "payout_status", headerName: "Payout", width: 110, valueFormatter: (p) => (p.value ? String(p.value).toLowerCase() : "—") },
      {
        headerName: "Ruling",
        width: 95,
        valueGetter: (p) => (p.data?.ruling ? `${p.data.ruling.percentToFreelancer}%` : "—"),
      },
      { field: "freelancer_name", headerName: "Freelancer", width: 140, filter: true },
      { field: "paypal_order_id", headerName: "PayPal order", width: 175, cellClass: "font-mono text-xs" },
      { field: "authorization_id", headerName: "Authorization", width: 175, cellClass: "font-mono text-xs" },
      { field: "capture_id", headerName: "Capture", width: 175, cellClass: "font-mono text-xs" },
      {
        field: "updated_at",
        headerName: "Updated",
        width: 150,
        sort: "desc",
        valueFormatter: (p) => new Date(p.value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
      },
    ],
    [],
  );

  async function ask(text: string) {
    if (!text.trim() || thinking) return;
    const next: Msg[] = [...msgs, { role: "user", content: text.trim() }];
    setMsgs(next);
    setInput("");
    setThinking(true);
    try {
      const r = await api<{ reply: string; toolCalls: string[] }>("/api/copilot", {
        messages: next.map(({ role, content }) => ({ role, content })),
      });
      setMsgs([...next, { role: "assistant", content: r.reply, tools: r.toolCalls }]);
    } catch (e) {
      setMsgs([...next, { role: "assistant", content: `I couldn't answer that: ${(e as Error).message}` }]);
    } finally {
      setThinking(false);
    }
  }

  return (
    <div className="mx-auto max-w-[90rem] px-4 sm:px-6 py-8">
      <h1 className="text-3xl font-bold tracking-tight">Operations</h1>
      <p className="mt-1 text-ink-2">Every hold, verdict and payout across Fairhold, reconciled against PayPal.</p>

      <dl className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-px overflow-hidden rounded-xl border border-line bg-line">
        {[
          ["Held in PayPal now", money(kpis.held), "text-held"],
          ["Released to freelancers", money(kpis.rel), "text-released"],
          ["Never charged to clients", money(kpis.ret), "text-returned"],
          ["Platform fees", money(kpis.fees), "text-ink"],
          ["Average AI score", kpis.scored ? `${Math.round(kpis.avg * 100)}%` : "—", "text-accent"],
        ].map(([k, v, c]) => (
          <div key={k} className="bg-surface px-4 py-3">
            <dt className="text-xs text-ink-2">{k}</dt>
            <dd className={`mt-1 text-xl font-bold num ${c}`}>{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 grid xl:grid-cols-[minmax(0,1fr)_400px] gap-6 items-start">
        <div className="h-[560px]">
          {err && <p className="text-returned text-sm mb-2">{err}</p>}
          <AgGridReact<Row>
            theme={gridTheme}
            rowData={rows ?? undefined}
            loading={rows === null}
            columnDefs={cols}
            getRowId={(p) => p.data.id}
            defaultColDef={{ sortable: true, resizable: true }}
            pagination
            paginationPageSize={20}
            overlayNoRowsTemplate="No milestones yet. Start the bakery demo from the home page."
          />
        </div>

        <section className="panel flex flex-col h-[560px]" aria-label="Operations copilot">
          <div className="p-4 border-b border-line">
            <h2 className="font-semibold">Ask about the money</h2>
            <p className="text-xs text-ink-2 mt-0.5">An AI agent with PayPal Agent Toolkit tools and Fairhold’s ledger.</p>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm" aria-live="polite">
            {msgs.length === 0 && (
              <div className="space-y-2">
                {PROMPTS.map((p) => (
                  <button key={p} className="block w-full text-left rounded-lg border border-line px-3 py-2 hover:bg-surface-2" onClick={() => ask(p)}>
                    {p}
                  </button>
                ))}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "ml-8 rounded-lg bg-surface-2 px-3 py-2" : ""}>
                <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                {m.tools && m.tools.length > 0 && <p className="mt-1.5 text-xs text-ink-3">Looked up: {[...new Set(m.tools)].join(", ")}</p>}
              </div>
            ))}
            {thinking && (
              <p className="flex items-center gap-2 text-ink-2">
                <Spinner /> Checking PayPal and the ledger…
              </p>
            )}
            <div ref={endRef} />
          </div>
          <form
            className="p-3 border-t border-line flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
          >
            <input aria-label="Ask a question" className="field text-sm" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about holds, payouts, disputes…" />
            <button className="btn btn-primary btn-sm h-auto" disabled={thinking || !input.trim()}>
              Ask
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
