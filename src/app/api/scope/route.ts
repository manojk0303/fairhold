import { z } from "zod/v4";
import { json, fail, handle } from "@/lib/http";
import { compileScope } from "@/lib/ai/scope";

export const maxDuration = 120;

const Body = z.object({
  brief: z.string().min(20, "Describe the job in at least a sentence or two").max(6000),
  budget: z.number().positive().max(10000),
  currency: z.string().length(3).default("USD"),
});

export async function POST(req: Request) {
  return handle(async () => {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input");
    return json(await compileScope(parsed.data));
  });
}
