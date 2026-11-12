import "server-only";
import { z } from "zod/v4";
import { runAgent, tool } from "./llm";
import { inspectPage, inspectRepo } from "./evidence";
import { paypalToolkitTools } from "./paypal-tools";
import type { Criterion, Dispute, Ruling, Submission, Verdict } from "../types";

const SYSTEM = `You are Fairhold's dispute mediator. A client and a freelancer disagree about how much of a
milestone's held PayPal funds should be released. An AI verifier already scored the submission; one
party objects. Your ruling decides the split and is executed automatically, so be careful and fair.

Process:
1. Confirm the payment facts with the PayPal tools (look up the order to confirm the held amount and
   its status). Mention what you confirmed.
2. Re-check the disputed points against the evidence yourself (inspect links or repos as needed).
   Do not simply defer to the verifier, and do not simply side with whoever argues more forcefully.
3. Weigh both statements against the agreed criteria. Scope agreed in advance is binding; new
   requirements raised after the fact do not count against the freelancer; claims without evidence
   carry little weight.
4. Call issue_ruling once with the percentage of the held amount that goes to the freelancer
   (the rest is returned to the client), 2-5 short findings, and a neutral rationale addressed to both.`;

export async function mediate(opts: {
  dealTitle: string;
  milestoneTitle: string;
  amount: number;
  currency: string;
  orderId: string | null;
  criteria: Criterion[];
  submission: Submission | null;
  verdict: Verdict | null;
  dispute: Dispute;
  onStep?: (s: string) => Promise<void> | void;
}): Promise<Ruling> {
  const paypalChecks: string[] = [];
  const log = async (s: string) => opts.onStep?.(s);
  let ruling: { percent_to_freelancer: number; findings: string[]; rationale: string } | null = null;

  const ppTools = await paypalToolkitTools({ orders: { get: true } }, async (name, args) => {
    const line = `PayPal ${name.replace(/_/g, " ")} ${JSON.stringify(args)}`;
    paypalChecks.push(line);
    await log(`Checked PayPal: ${name.replace(/_/g, " ")}`);
  });

  const tools = [
    ...ppTools,
    tool({
      name: "inspect_web_page",
      description: "Fetch a live web page and return a structured report of its content.",
      schema: z.object({ url: z.string() }),
      run: async ({ url }) => {
        await log(`Re-opened ${url}`);
        try {
          return await inspectPage(url);
        } catch (e) {
          return `ERROR: ${(e as Error).message}`;
        }
      },
    }),
    tool({
      name: "inspect_github_repo",
      description: "Inspect a public GitHub repository (files, README, commits).",
      schema: z.object({ repo: z.string() }),
      run: async ({ repo }) => {
        await log(`Re-inspected ${repo}`);
        try {
          return await inspectRepo(repo);
        } catch (e) {
          return `ERROR: ${(e as Error).message}`;
        }
      },
    }),
    tool({
      name: "issue_ruling",
      description: "Issue the binding ruling. Call exactly once.",
      schema: z.object({
        percent_to_freelancer: z.number().describe("0-100, share of the held amount released to the freelancer"),
        findings: z.array(z.string()).describe("2-5 short findings"),
        rationale: z.string().describe("Neutral 3-5 sentence explanation addressed to both parties"),
      }),
      run: async (input) => {
        ruling = input;
        await log("Issued ruling");
        return "Ruling recorded.";
      },
    }),
  ];

  const dossier = `Project: ${opts.dealTitle}
Milestone: ${opts.milestoneTitle}
Held amount: ${opts.amount.toFixed(2)} ${opts.currency}
PayPal order id: ${opts.orderId ?? "(none)"}

Agreed criteria:
${opts.criteria.map((c) => `- ${c.id} [weight ${c.weight}] ${c.text}`).join("\n")}

Submission:
Links: ${opts.submission?.links.join(", ") || "(none)"}
Notes: ${opts.submission?.notes || "(none)"}${opts.submission?.image ? `\nAn image "${opts.submission.image.name}" was also submitted (the verifier saw it).` : ""}

Verifier's verdict (score ${opts.verdict ? Math.round(opts.verdict.score * 100) : "n/a"}%, proposed release ${opts.verdict?.payoutAmount.toFixed(2) ?? "n/a"}):
${opts.verdict?.results.map((r) => `- ${r.id}: ${r.outcome} (credit ${r.credit}) — ${r.evidence}`).join("\n") ?? "(none)"}
Summary: ${opts.verdict?.summary ?? ""}

Dispute opened by the ${opts.dispute.openedBy}. Statements:
${opts.dispute.statements.map((s) => `[${s.by}] ${s.text}`).join("\n\n")}`;

  await log("Mediator opened the case file");
  const final = await runAgent({ system: SYSTEM, user: dossier, tools, finishTool: "issue_ruling", maxSteps: 10 });
  const r = ruling as { percent_to_freelancer: number; findings: string[]; rationale: string } | null;
  if (!r) throw new Error("The mediator finished without a ruling. Try again.");

  const pct = Math.min(100, Math.max(0, Math.round(r.percent_to_freelancer)));
  return {
    percentToFreelancer: pct,
    payoutAmount: Math.round(opts.amount * pct) / 100,
    findings: r.findings.slice(0, 5),
    rationale: r.rationale,
    paypalChecks,
    model: final.model,
    at: new Date().toISOString(),
  };
}
