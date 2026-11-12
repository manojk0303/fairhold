import "server-only";
import { z } from "zod/v4";
import { runAgent, tool } from "./llm";
import type { MilestoneDraft } from "../types";

const ScopeSchema = z.object({
  title: z.string().describe("Short project title, max 60 chars"),
  milestones: z
    .array(
      z.object({
        title: z.string(),
        summary: z.string().describe("One sentence on what is delivered"),
        share_percent: z.number().describe("Share of the total budget, all milestones sum to 100"),
        criteria: z.array(
          z.object({
            text: z
              .string()
              .describe(
                "A single objectively checkable acceptance criterion, phrased as a statement that is true when met",
              ),
            weight: z.number().describe("Importance 1 (nice to have) to 5 (essential)"),
            check: z
              .enum(["page", "repo", "image", "text"])
              .describe(
                "How evidence is checked: page = a live web URL, repo = a public GitHub repo, image = an uploaded image, text = written notes/document",
              ),
          }),
        ),
      }),
    )
    .describe("1 to 4 milestones"),
  risks: z.array(z.string()).describe("Ambiguities in the brief that the parties should settle now"),
});

const SYSTEM = `You are Fairhold's scope compiler. Freelance disputes mostly come from vague scope.
Turn a client's plain-language brief into milestone-based, objectively verifiable acceptance criteria
that an AI reviewer can later check against submitted evidence (a live URL, a GitHub repo, an image,
or written notes).

Rules:
- 1 to 4 milestones; each pays for something independently useful. Small jobs get 1-2 milestones.
- 3 to 6 criteria per milestone. Each criterion is binary-checkable from evidence: concrete, observable,
  no subjective words like "beautiful" or "modern" unless pinned to something observable.
- Use only facts from the brief. Never invent brand colours, names, URLs or numbers the client didn't give;
  if a detail is missing, phrase the criterion generically and list the gap in "risks".
- Weights 1-5 reflect how much of the milestone's value the criterion carries.
- Prefer criteria a reviewer can verify from a public URL or repo over ones that need private access.
- Keep wording short, specific, and neutral to both parties.
- List genuine ambiguities in "risks" (max 3), phrased as questions.`;

export async function compileScope(input: {
  brief: string;
  budget: number;
  currency: string;
}): Promise<{ title: string; milestones: MilestoneDraft[]; risks: string[] }> {
  let out: z.infer<typeof ScopeSchema> | null = null;
  await runAgent({
    system: SYSTEM + "\n\nReturn your answer by calling submit_scope exactly once.",
    user: `Budget: ${input.budget.toFixed(2)} ${input.currency}\n\nClient brief:\n${input.brief}`,
    tools: [
      tool({
        name: "submit_scope",
        description: "Submit the compiled scope: title, milestones with weighted acceptance criteria, and open questions.",
        schema: ScopeSchema,
        run: (v) => {
          if (!v.milestones.length) return "ERROR: include at least one milestone.";
          if (v.milestones.some((m) => !m.criteria.length)) return "ERROR: every milestone needs at least one criterion.";
          out = v;
          return "Scope recorded.";
        },
      }),
    ],
    finishTool: "submit_scope",
    maxSteps: 4,
  });
  if (!out) throw new Error("The scope compiler didn't return a scope. Try again.");
  const result = out as z.infer<typeof ScopeSchema>;

  // Normalise: shares -> exact amounts that sum to the budget; clamp weights.
  const ms = result.milestones.slice(0, 4);
  const shareTotal = ms.reduce((s, m) => s + Math.max(1, m.share_percent), 0);
  let allocated = 0;
  const milestones: MilestoneDraft[] = ms.map((m, i) => {
    const isLast = i === ms.length - 1;
    const amount = isLast
      ? Math.round((input.budget - allocated) * 100) / 100
      : Math.round(((input.budget * Math.max(1, m.share_percent)) / shareTotal) * 100) / 100;
    allocated += amount;
    return {
      title: m.title,
      summary: m.summary,
      amount,
      criteria: m.criteria.slice(0, 6).map((c, j) => ({
        id: `c${j + 1}`,
        text: c.text,
        weight: Math.min(5, Math.max(1, Math.round(c.weight))),
        check: c.check,
      })),
    };
  });
  return { title: result.title.slice(0, 80), milestones, risks: result.risks.slice(0, 3) };
}
