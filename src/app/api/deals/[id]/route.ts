import type { NextRequest } from "next/server";
import { json, fail, handle } from "@/lib/http";
import { getDealView } from "@/lib/deals";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/deals/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const view = await getDealView(id, req.nextUrl.searchParams.get("t"));
    if (!view) return fail("Agreement not found", 404);
    return json(view);
  });
}
