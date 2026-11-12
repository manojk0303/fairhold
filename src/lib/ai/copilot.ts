import "server-only";
import { z } from "zod/v4";
import { runAgent, tool } from "./llm";
import { paypalToolkitTools } from "./paypal-tools";
import { ledger } from "../deals";

const SYSTEM = `You are the Fairhold operations copilot, used by the team that runs Fairhold (an escrow-style
milestone payment platform on PayPal). You answer questions about held funds, releases, payouts, disputes
and PayPal activity, and you can look up PayPal invoices.

- Use fairhold_ledger for Fairhold's own view (milestones, holds, verdicts, payouts).
- Use the PayPal tools for PayPal's source of truth (orders, transactions, disputes, invoices, refunds).
- Cross-check the two when asked about discrepancies.
- You are read-only: you look things up, you never move money.
- Reply in plain text (no markdown symbols like ** or #). Keep it short; use simple "- " lines for lists.
  All amounts are sandbox money.`;

export async function runCopilot(
  history: { role: "user" | "assistant"; content: string }[],
): Promise<{ reply: string; toolCalls: string[] }> {
  const toolCalls: string[] = [];
  const pp = await paypalToolkitTools(
    {
      orders: { get: true },
      transactions: { list: true },
      disputes: { list: true, get: true },
      invoices: { list: true, get: true },
      payments: { getRefunds: true },
      insights: { get: true },
    },
    (name) => {
      toolCalls.push(`PayPal: ${name}`);
    },
  );
  const tools = [
    ...pp,
    tool({
      name: "fairhold_ledger",
      description:
        "Fairhold's ledger of milestones: status, held amount, PayPal order/authorization/capture ids, AI verdict score, payout amount and payout status.",
      schema: z.object({
        status: z.string().nullable().optional().describe("Optional status filter, e.g. funded, verified, released, refunded, disputed"),
      }),
      run: async ({ status }) => {
        toolCalls.push("Fairhold ledger");
        const rows = (await ledger()).filter((r) => !status || r.status === status).slice(0, 60);
        return JSON.stringify(
          rows.map((r) => ({
            deal: r.deal_title,
            milestone: r.title,
            status: r.status,
            amount: r.amount,
            currency: r.currency,
            client: r.client_name,
            freelancer: r.freelancer_name,
            order: r.paypal_order_id,
            authorization: r.authorization_id,
            capture: r.capture_id,
            captured: r.captured_amount,
            fee: r.fee_amount,
            payout: r.payout_amount,
            payout_status: r.payout_status,
            ai_score: r.verdict?.score ?? null,
            ruling_pct: r.ruling?.percentToFreelancer ?? null,
            updated: r.updated_at,
          })),
        );
      },
    }),
  ];

  const prior = history.slice(-12, -1);
  const last = history[history.length - 1];
  const final = await runAgent({ system: SYSTEM, user: last.content, history: prior, tools, maxSteps: 8 });
  return { reply: final.text || "(no answer)", toolCalls };
}
