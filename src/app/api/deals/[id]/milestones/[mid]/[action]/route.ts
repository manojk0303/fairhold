import type { NextRequest } from "next/server";
import { z } from "zod/v4";
import { json, fail, handle } from "@/lib/http";
import {
  getDeal,
  getMilestone,
  roleFor,
  createFundingOrder,
  authorizeFunding,
  submitAndVerify,
  settle,
  openDispute,
  addStatement,
  ruleOnDispute,
  retryPayout,
} from "@/lib/deals";

// AI review and mediation run agent loops; give them room on serverless.
export const maxDuration = 300;

const Submit = z.object({
  notes: z.string().max(4000).default(""),
  links: z.array(z.url()).max(6).default([]),
  image: z
    .object({
      name: z.string().max(200),
      mediaType: z.string(),
      dataUrl: z.string().max(4_000_000, "Image must be under ~3 MB"),
    })
    .nullable()
    .optional(),
});

export async function POST(req: NextRequest, ctx: RouteContext<"/api/deals/[id]/milestones/[mid]/[action]">) {
  return handle(async () => {
    const { id, mid, action } = await ctx.params;
    const deal = await getDeal(id);
    const m = await getMilestone(mid);
    if (!deal || !m || m.deal_id !== deal.id) return fail("Milestone not found", 404);
    const role = roleFor(deal, req.nextUrl.searchParams.get("t"));
    const body = req.headers.get("content-type")?.includes("json") ? await req.json().catch(() => ({})) : {};
    const party = role === "client" || role === "freelancer" ? role : null;

    switch (action) {
      case "order": {
        if (role !== "client") return fail("Only the client can fund a milestone", 403);
        return json({ orderId: await createFundingOrder(deal, m) });
      }
      case "authorize": {
        if (role !== "client") return fail("Only the client can fund a milestone", 403);
        const orderId = String(body.orderId ?? "");
        return json({ milestone: await authorizeFunding(deal, m, orderId) });
      }
      case "submit": {
        if (role !== "freelancer") return fail("Only the freelancer can submit work", 403);
        const parsed = Submit.safeParse(body);
        if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid submission");
        if (!parsed.data.links.length && !parsed.data.image && parsed.data.notes.trim().length < 10)
          return fail("Add a link, an image, or a written description of the work");
        const milestone = await submitAndVerify(deal, m, {
          notes: parsed.data.notes,
          links: parsed.data.links,
          image: parsed.data.image ?? null,
          at: new Date().toISOString(),
        });
        return json({ milestone });
      }
      case "accept": {
        if (role !== "client") return fail("Only the client can release funds early", 403);
        if (m.status !== "verified" || !m.verdict) return fail("There is no verdict to accept yet");
        await settle(deal, m, m.verdict.payoutAmount, "Client accepted the AI verdict.", deal.client_name);
        return json({ ok: true });
      }
      case "dispute": {
        if (!party) return fail("Only a party to the agreement can object", 403);
        const text = String(body.text ?? "").trim();
        if (text.length < 15) return fail("Explain the objection in at least a sentence");
        return json({ milestone: await openDispute(deal, m, party, text) });
      }
      case "statement": {
        if (!party) return fail("Only a party to the agreement can add a statement", 403);
        const text = String(body.text ?? "").trim();
        if (text.length < 15) return fail("Write at least a sentence");
        await addStatement(deal, m, party, text);
        return json({ ok: true });
      }
      case "rule": {
        if (!party) return fail("Only a party to the agreement can request a ruling", 403);
        await ruleOnDispute(deal, m);
        return json({ ok: true });
      }
      case "retry-payout": {
        if (!party) return fail("Forbidden", 403);
        await retryPayout(deal, m);
        return json({ ok: true });
      }
      default:
        return fail("Unknown action", 404);
    }
  });
}
