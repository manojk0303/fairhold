import "server-only";
import { z } from "zod/v4";
import { runAgent, tool, llmInfo } from "./llm";
import { inspectPage, inspectRepo, readRepoFile, imageFacts } from "./evidence";
import type { Criterion, CriterionResult, Submission, Verdict } from "../types";

const SYSTEM = `You are Fairhold's independent deliverable verifier. Money held in PayPal is released to a
freelancer in proportion to how many agreed acceptance criteria their submission meets. Both parties
agreed to these criteria in advance, and both rely on you to be accurate and even-handed.

How to work:
1. Gather evidence with the tools. Always call a tool on every submitted link, whatever its host (including localhost);
   the tool reports whether it is reachable. Inspect every submitted link (use inspect_web_page for websites,
   inspect_github_repo / read_github_file for repositories). Follow up on specific pages or files when
   a criterion needs it (e.g. a /contact page, package.json, a test file). Do not guess about content
   you have not looked at.
2. Judge each criterion strictly on observable evidence:
   - "met" (credit 1.0): clearly satisfied.
   - "partial" (credit between 0.25 and 0.75): partly satisfied; set credit to the fraction delivered.
   - "unmet" (credit 0): missing, broken, or not verifiable from the evidence provided.
   The freelancer's notes are claims, not evidence; verify them.
3. For each criterion, cite the concrete evidence (quote text, name the file, describe what the image
   shows) in one or two sentences. Be specific enough that either party can check your work.
4. Call record_verdict exactly once with every criterion id. Your summary speaks to both parties in
   plain language: what was delivered, what is missing, and what the freelancer could fix.

You never decide the payout amount yourself; Fairhold computes it from your per-criterion credits.`;

const VerdictInput = z.object({
  results: z.array(
    z.object({
      id: z.string().describe("Criterion id, e.g. c1"),
      outcome: z.enum(["met", "partial", "unmet"]),
      credit: z.number().describe("1 for met, 0 for unmet, 0.25-0.75 for partial"),
      evidence: z.string().describe("Concrete observation from the evidence"),
      reasoning: z.string().describe("Why this outcome"),
    }),
  ),
  summary: z.string().describe("2-4 sentence plain-language summary for client and freelancer"),
});

export function scoreResults(criteria: Criterion[], results: CriterionResult[]) {
  const totalWeight = criteria.reduce((s, c) => s + c.weight, 0) || 1;
  const earned = criteria.reduce((s, c) => {
    const r = results.find((x) => x.id === c.id);
    return s + c.weight * (r ? r.credit : 0);
  }, 0);
  return earned / totalWeight;
}

export function payoutFor(amount: number, score: number) {
  return Math.round(amount * score * 100) / 100;
}

export function recommendationFor(score: number): Verdict["recommendation"] {
  if (score >= 0.98) return "release_full";
  if (score < 0.4) return "request_revision";
  return "release_partial";
}

export async function verifyDeliverable(opts: {
  dealTitle: string;
  milestoneTitle: string;
  milestoneSummary: string;
  amount: number;
  currency: string;
  criteria: Criterion[];
  submission: Submission;
  onStep?: (step: string) => Promise<void> | void;
}): Promise<Verdict> {
  const steps: string[] = [];
  const log = async (s: string) => {
    steps.push(s);
    await opts.onStep?.(s);
  };
  let recorded: z.infer<typeof VerdictInput> | null = null;
  // Code-level guarantee: no verdict until every submitted link has actually been inspected.
  const norm = (u: string) => u.trim().replace(/\/+$/, "").toLowerCase();
  const pending = new Set(opts.submission.links.map(norm));
  const markInspected = (u: string) => {
    const n = norm(u);
    for (const p of pending) if (p === n || p.includes(n) || n.includes(p)) pending.delete(p);
  };

  const tools = [
    tool({
      name: "inspect_web_page",
      description:
        "Fetch a live web page and return a structured report: title, meta, headings, links, forms, buttons, images with alt text, CSS colours, responsive @media rules and visible text.",
      schema: z.object({ url: z.string().describe("Absolute http(s) URL") }),
      run: async ({ url }) => {
        markInspected(url);
        await log(`Opened ${url}`);
        try {
          return await inspectPage(url);
        } catch (e) {
          await log(`Could not load ${url}`);
          return `ERROR: ${(e as Error).message}`;
        }
      },
    }),
    tool({
      name: "inspect_github_repo",
      description:
        "Inspect a public GitHub repository: metadata, licence, recent commits, the file tree and the README.",
      schema: z.object({ repo: z.string().describe("owner/name or github.com URL") }),
      run: async ({ repo }) => {
        markInspected(repo);
        await log(`Inspected repository ${repo}`);
        try {
          return await inspectRepo(repo);
        } catch (e) {
          return `ERROR: ${(e as Error).message}`;
        }
      },
    }),
    tool({
      name: "read_github_file",
      description: "Read one file from a public GitHub repository.",
      schema: z.object({ repo: z.string(), path: z.string() }),
      run: async ({ repo, path }) => {
        await log(`Read ${path}`);
        try {
          return await readRepoFile(repo, path);
        } catch (e) {
          return `ERROR: ${(e as Error).message}`;
        }
      },
    }),
    tool({
      name: "record_verdict",
      description: "Record the final per-criterion verdict. Call exactly once, after gathering evidence.",
      schema: VerdictInput,
      run: async (input) => {
        if (pending.size) {
          return `ERROR: you have not inspected these submitted links yet: ${[...pending].join(", ")}. Call inspect_web_page (or inspect_github_repo for GitHub) on each one first. The tool reports reachability; never assume a link is unreachable.`;
        }
        recorded = input;
        await log("Recorded verdict");
        return "Verdict recorded. You are done.";
      },
    }),
  ];

  let image: { mediaType: string; base64: string } | null = null;
  let imageNote = "";
  if (opts.submission.image?.dataUrl) {
    const f = imageFacts(opts.submission.image.dataUrl);
    const canSee = llmInfo().vision && ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(f.mediaType);
    if (canSee) image = { mediaType: f.mediaType, base64: f.base64 };
    imageNote = `\nUploaded image "${opts.submission.image.name}": ${f.mediaType}, ${f.width}x${f.height}px, ${Math.round(f.bytes / 1024)} KB (measured by Fairhold, reliable).${
      canSee ? " The image is attached." : " You cannot see the image itself; judge image criteria only from these measured facts and the notes, and mark visual-only criteria partial at most."
    }`;
    await log(`Measured uploaded image: ${f.width}x${f.height}px`);
  }
  const user = `Project: ${opts.dealTitle}
Milestone: ${opts.milestoneTitle} — ${opts.milestoneSummary}
Held in PayPal for this milestone: ${opts.amount.toFixed(2)} ${opts.currency}

Acceptance criteria (agreed by both parties):
${opts.criteria.map((c) => `- ${c.id} [weight ${c.weight}, evidence: ${c.check}] ${c.text}`).join("\n")}

Freelancer's submission:
Links: ${opts.submission.links.length ? opts.submission.links.join(", ") : "(none)"}
Notes: ${opts.submission.notes || "(none)"}${imageNote}

Verify the submission against every criterion, then call record_verdict.`;

  await log("Started review against the agreed criteria");
  const final = await runAgent({ system: SYSTEM, user, image, tools, finishTool: "record_verdict", maxSteps: 10 });

  const verdictInput = recorded as z.infer<typeof VerdictInput> | null;
  if (!verdictInput) throw new Error("The verifier finished without recording a verdict. Try again.");

  const results: CriterionResult[] = opts.criteria.map((c) => {
    const r = verdictInput.results.find((x) => x.id === c.id);
    if (!r) return { id: c.id, outcome: "unmet", credit: 0, evidence: "Not assessed.", reasoning: "No verdict was returned for this criterion." };
    const credit =
      r.outcome === "met" ? 1 : r.outcome === "unmet" ? 0 : Math.min(0.75, Math.max(0.25, r.credit));
    return { ...r, credit };
  });
  const score = scoreResults(opts.criteria, results);
  return {
    score,
    payoutAmount: payoutFor(opts.amount, score),
    recommendation: recommendationFor(score),
    summary: verdictInput.summary,
    results,
    model: final.model,
    at: new Date().toISOString(),
    steps,
  };
}
