import { z } from "zod/v4";
import { json, fail, handle } from "@/lib/http";
import { createDeal } from "@/lib/deals";

const Criterion = z.object({
  id: z.string(),
  text: z.string().min(3).max(400),
  weight: z.number().int().min(1).max(5),
  check: z.enum(["page", "repo", "image", "text"]),
});
const Body = z.object({
  title: z.string().min(3).max(80),
  brief: z.string().min(10).max(6000),
  currency: z.string().length(3),
  clientName: z.string().min(1).max(60),
  freelancerName: z.string().min(1).max(60),
  freelancerEmail: z.email(),
  milestones: z
    .array(
      z.object({
        title: z.string().min(2).max(120),
        summary: z.string().max(400),
        amount: z.number().positive().max(10000),
        criteria: z.array(Criterion).min(1).max(8),
      }),
    )
    .min(1)
    .max(6),
});

export async function POST(req: Request) {
  return handle(async () => {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input");
    const d = parsed.data;
    const res = await createDeal({ ...d, milestones: d.milestones.map((m) => ({ ...m, criteria: m.criteria.map((c, i) => ({ ...c, id: `c${i + 1}` })) })) });
    return json(res);
  });
}
