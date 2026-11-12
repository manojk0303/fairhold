import { z } from "zod/v4";
import { json, fail, handle } from "@/lib/http";
import { runCopilot } from "@/lib/ai/copilot";

export const maxDuration = 120;

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) }))
    .min(1)
    .max(30),
});

export async function POST(req: Request) {
  return handle(async () => {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return fail("Invalid conversation");
    if (parsed.data.messages.at(-1)?.role !== "user") return fail("Last message must be from the user");
    return json(await runCopilot(parsed.data.messages));
  });
}
