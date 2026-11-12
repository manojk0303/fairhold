import "server-only";
import { customAlphabet } from "nanoid";
import { sql, one } from "./db";
import * as paypal from "./paypal";
import { verifyDeliverable } from "./ai/verify";
import { mediate } from "./ai/mediate";
import type {
  Deal,
  DealEvent,
  Dispute,
  Milestone,
  MilestoneDraft,
  MilestoneStatus,
  Role,
  Submission,
} from "./types";

const id = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 10);
const token = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz", 24);

const AUTO_SETTLE_HOURS = 72;
export const feePercent = () => Number(process.env.PLATFORM_FEE_PERCENT ?? 3);

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function mapMilestone(r: Record<string, unknown>): Milestone {
  return {
    ...(r as unknown as Milestone),
    amount: Number(r.amount),
    captured_amount: num(r.captured_amount),
    fee_amount: num(r.fee_amount),
    payout_amount: num(r.payout_amount),
    auth_expires_at: r.auth_expires_at ? new Date(r.auth_expires_at as string).toISOString() : null,
    updated_at: new Date(r.updated_at as string).toISOString(),
  };
}

type DealRow = Deal & { client_token: string; freelancer_token: string };

function mapDeal(r: Record<string, unknown>): DealRow {
  return {
    ...(r as unknown as DealRow),
    total: Number(r.total),
    created_at: new Date(r.created_at as string).toISOString(),
  };
}

export async function addEvent(
  dealId: string,
  milestoneId: string | null,
  kind: string,
  actor: string,
  message: string,
  data: Record<string, unknown> | null = null,
) {
  await sql(
    "INSERT INTO events (deal_id, milestone_id, kind, actor, message, data) VALUES ($1,$2,$3,$4,$5,$6)",
    [dealId, milestoneId, kind, actor, message, data ? JSON.stringify(data) : null],
  );
}

export async function createDeal(input: {
  title: string;
  brief: string;
  currency: string;
  clientName: string;
  freelancerName: string;
  freelancerEmail: string;
  milestones: MilestoneDraft[];
  isDemo?: boolean;
}) {
  const dealId = id();
  const clientToken = token();
  const freelancerToken = token();
  const total = input.milestones.reduce((s, m) => s + m.amount, 0);
  await sql(
    `INSERT INTO deals (id, title, brief, currency, total, client_name, freelancer_name, freelancer_email, client_token, freelancer_token, is_demo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      dealId,
      input.title,
      input.brief,
      input.currency,
      total.toFixed(2),
      input.clientName,
      input.freelancerName,
      input.freelancerEmail,
      clientToken,
      freelancerToken,
      Boolean(input.isDemo),
    ],
  );
  for (const [i, m] of input.milestones.entries()) {
    await sql(
      `INSERT INTO milestones (id, deal_id, position, title, summary, amount, criteria) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id(), dealId, i, m.title, m.summary, m.amount.toFixed(2), JSON.stringify(m.criteria)],
    );
  }
  await addEvent(
    dealId,
    null,
    "deal.created",
    input.clientName,
    `Agreement created: ${input.milestones.length} milestone${input.milestones.length > 1 ? "s" : ""}, ${total.toFixed(2)} ${input.currency} total`,
  );
  return { dealId, clientToken, freelancerToken };
}

export async function getDeal(dealId: string) {
  const r = await one("SELECT * FROM deals WHERE id = $1", [dealId]);
  return r ? mapDeal(r) : null;
}

export async function getMilestone(milestoneId: string) {
  const r = await one("SELECT * FROM milestones WHERE id = $1", [milestoneId]);
  return r ? mapMilestone(r) : null;
}

export function roleFor(deal: DealRow, t: string | null): Role {
  if (t && t === deal.client_token) return "client";
  if (t && t === deal.freelancer_token) return "freelancer";
  return "viewer";
}

/** Atomic status transition; returns the updated row or null if the milestone was not in `from`. */
async function transition(
  milestoneId: string,
  from: MilestoneStatus[],
  to: MilestoneStatus,
  extra: Record<string, unknown> = {},
) {
  const keys = Object.keys(extra);
  const sets = ["status = $2", "updated_at = now()", ...keys.map((k, i) => `${k} = $${i + 4}`)];
  const vals = keys.map((k) => {
    const v = extra[k];
    return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
  });
  const r = await one(
    `UPDATE milestones SET ${sets.join(", ")} WHERE id = $1 AND status = ANY($3::text[]) RETURNING *`,
    [milestoneId, to, from, ...vals],
  );
  return r ? mapMilestone(r) : null;
}

async function patch(milestoneId: string, extra: Record<string, unknown>) {
  const keys = Object.keys(extra);
  const sets = ["updated_at = now()", ...keys.map((k, i) => `${k} = $${i + 2}`)];
  const vals = keys.map((k) => {
    const v = extra[k];
    return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
  });
  await sql(`UPDATE milestones SET ${sets.join(", ")} WHERE id = $1`, [milestoneId, ...vals]);
}

/* ---------------- Funding (PayPal authorization = funds held) ---------------- */

export async function createFundingOrder(deal: DealRow, m: Milestone) {
  if (m.status !== "awaiting_funds") throw new Error("This milestone is already funded.");
  const order = await paypal.createHoldOrder({
    referenceId: m.id,
    description: `Fairhold hold: ${deal.title} / ${m.title}`,
    amount: m.amount,
    currency: deal.currency,
  });
  await patch(m.id, { paypal_order_id: order.id });
  return order.id;
}

export async function authorizeFunding(deal: DealRow, m: Milestone, orderId: string) {
  if (m.paypal_order_id !== orderId) throw new Error("Order does not belong to this milestone.");
  const { order, authorization } = await paypal.authorizeOrder(orderId);
  const updated = await transition(m.id, ["awaiting_funds"], "funded", {
    authorization_id: authorization.id,
    auth_expires_at: authorization.expiration_time ?? null,
  });
  if (!updated) throw new Error("Milestone changed state while funding.");
  const payer = order.payer?.email_address ?? "buyer";
  await addEvent(deal.id, m.id, "funds.held", deal.client_name, `${m.amount.toFixed(2)} ${deal.currency} held in PayPal for “${m.title}”`, {
    orderId,
    authorizationId: authorization.id,
    authorizationStatus: authorization.status,
    expires: authorization.expiration_time,
    payer,
  });
  return updated;
}

/* ---------------- Submission + AI verification ---------------- */

export async function submitAndVerify(deal: DealRow, m: Milestone, submission: Submission) {
  const started = await transition(m.id, ["funded", "verified"], "verifying", {
    submission,
    attempts: m.attempts + 1,
    verdict: null,
  });
  if (!started) throw new Error("This milestone can't take a submission right now.");
  await addEvent(deal.id, m.id, "work.submitted", deal.freelancer_name, `Submitted work for “${m.title}” (attempt ${m.attempts + 1})`, {
    links: submission.links,
    hasImage: Boolean(submission.image),
  });
  try {
    const verdict = await verifyDeliverable({
      dealTitle: deal.title,
      milestoneTitle: m.title,
      milestoneSummary: m.summary,
      amount: m.amount,
      currency: deal.currency,
      criteria: m.criteria,
      submission,
      onStep: (s) => addEvent(deal.id, m.id, "ai.step", "Fairhold verifier", s),
    });
    const done = await transition(m.id, ["verifying"], "verified", { verdict });
    await addEvent(
      deal.id,
      m.id,
      "ai.verdict",
      "Fairhold verifier",
      `Verdict: ${Math.round(verdict.score * 100)}% of criteria met. Proposed release ${verdict.payoutAmount.toFixed(2)} of ${m.amount.toFixed(2)} ${deal.currency}`,
      { score: verdict.score, payout: verdict.payoutAmount, recommendation: verdict.recommendation },
    );
    return done;
  } catch (e) {
    await transition(m.id, ["verifying"], "funded", {});
    await addEvent(deal.id, m.id, "ai.error", "Fairhold verifier", `Review failed: ${(e as Error).message}`);
    throw e;
  }
}

/* ---------------- Settlement (partial capture + payout, or void) ---------------- */

export async function settle(deal: DealRow, m: Milestone, amount: number, reason: string, actor: string) {
  const locked = await transition(m.id, ["verified", "disputed"], "settling");
  if (!locked) throw new Error("This milestone is not ready to settle.");
  if (!locked.authorization_id) throw new Error("No PayPal authorization on file.");
  const release = Math.min(locked.amount, Math.max(0, Math.round(amount * 100) / 100));
  try {
    if (release <= 0) {
      await paypal.voidAuthorization(locked.authorization_id);
      await transition(m.id, ["settling"], "refunded", { captured_amount: 0, fee_amount: 0, payout_amount: 0 });
      await addEvent(deal.id, m.id, "funds.returned", actor, `Hold voided. All ${locked.amount.toFixed(2)} ${deal.currency} returned to ${deal.client_name}. ${reason}`);
      return;
    }
    const capture = await paypal.captureAuthorization({
      authorizationId: locked.authorization_id,
      amount: release,
      currency: deal.currency,
      invoiceId: `FH-${m.id}-${locked.attempts}`,
      note: `Fairhold: ${m.title}. ${reason}`,
    });
    const fee = Math.round(release * feePercent()) / 100;
    const payoutAmount = Math.round((release - fee) * 100) / 100;
    await patch(m.id, { capture_id: capture.id, captured_amount: release, fee_amount: fee });
    const returned = Math.round((locked.amount - release) * 100) / 100;
    await addEvent(
      deal.id,
      m.id,
      "funds.captured",
      actor,
      `Captured ${release.toFixed(2)} ${deal.currency}${returned > 0 ? `; ${returned.toFixed(2)} released back to ${deal.client_name}` : ""}. ${reason}`,
      { captureId: capture.id, captureStatus: capture.status, returned },
    );

    await sendFreelancerPayout(deal, { ...locked, capture_id: capture.id, fee_amount: fee }, payoutAmount, fee);
  } catch (e) {
    // Roll back the lock so the action can be retried; record what happened.
    const current = await getMilestone(m.id);
    if (current?.status === "settling" && !current.capture_id) {
      await transition(m.id, ["settling"], m.status);
    }
    await addEvent(deal.id, m.id, "settle.error", "Fairhold", `Settlement step failed: ${(e as Error).message}`);
    throw e;
  }
}

async function sendFreelancerPayout(deal: DealRow, m: Milestone, payoutAmount: number, fee: number) {
  const payout = await paypal.sendPayout({
    batchId: `FH${m.id}${m.attempts}`,
    receiver: deal.freelancer_email,
    amount: payoutAmount,
    currency: deal.currency,
    note: `Payment for “${m.title}” (${deal.title}). Released by Fairhold after verification.`,
  });
  await transition(m.id, ["settling"], "released", {
    payout_amount: payoutAmount,
    payout_batch_id: payout.batch_header.payout_batch_id,
    payout_status: payout.batch_header.batch_status,
  });
  await addEvent(deal.id, m.id, "payout.sent", "Fairhold", `Paid ${payoutAmount.toFixed(2)} ${deal.currency} to ${deal.freelancer_name} via PayPal Payouts (fee ${fee.toFixed(2)})`, {
    payoutBatchId: payout.batch_header.payout_batch_id,
    status: payout.batch_header.batch_status,
  });
}

/** Captured but payout failed (e.g. transient PayPal error): retry just the payout. */
export async function retryPayout(deal: DealRow, m: Milestone) {
  if (m.status !== "settling" || !m.capture_id || m.payout_batch_id) throw new Error("Nothing to retry.");
  const captured = m.captured_amount ?? 0;
  const fee = m.fee_amount ?? 0;
  await sendFreelancerPayout(deal, m, Math.round((captured - fee) * 100) / 100, fee);
}

/* ---------------- Disputes + AI mediation ---------------- */

export async function openDispute(deal: DealRow, m: Milestone, by: "client" | "freelancer", text: string) {
  const dispute: Dispute = { openedBy: by, statements: [{ by, text, at: new Date().toISOString() }], status: "open" };
  const updated = await transition(m.id, ["verified"], "disputed", { dispute });
  if (!updated) throw new Error("Only a verified milestone can be disputed.");
  const who = by === "client" ? deal.client_name : deal.freelancer_name;
  await addEvent(deal.id, m.id, "dispute.opened", who, `Objected to the verdict on “${m.title}”`, { text });
  return updated;
}

export async function addStatement(deal: DealRow, m: Milestone, by: "client" | "freelancer", text: string) {
  if (m.status !== "disputed" || !m.dispute) throw new Error("No open dispute.");
  const dispute: Dispute = { ...m.dispute, statements: [...m.dispute.statements, { by, text, at: new Date().toISOString() }] };
  await patch(m.id, { dispute });
  const who = by === "client" ? deal.client_name : deal.freelancer_name;
  await addEvent(deal.id, m.id, "dispute.statement", who, "Added a statement to the dispute", { text });
}

export async function ruleOnDispute(deal: DealRow, m: Milestone) {
  if (m.status !== "disputed" || !m.dispute) throw new Error("No open dispute.");
  const ruling = await mediate({
    dealTitle: deal.title,
    milestoneTitle: m.title,
    amount: m.amount,
    currency: deal.currency,
    orderId: m.paypal_order_id,
    criteria: m.criteria,
    submission: m.submission,
    verdict: m.verdict,
    dispute: m.dispute,
    onStep: (s) => addEvent(deal.id, m.id, "ai.step", "Fairhold mediator", s),
  });
  await patch(m.id, { ruling, dispute: { ...m.dispute, status: "ruled" } });
  await addEvent(deal.id, m.id, "ai.ruling", "Fairhold mediator", `Ruling: ${ruling.percentToFreelancer}% (${ruling.payoutAmount.toFixed(2)} ${deal.currency}) to ${deal.freelancer_name}`, {
    percent: ruling.percentToFreelancer,
  });
  const fresh = (await getMilestone(m.id))!;
  await settle(deal, fresh, ruling.payoutAmount, "Settled by mediator ruling.", "Fairhold mediator");
}

/* ---------------- Read model ---------------- */

async function refreshBackground(deal: DealRow, milestones: Milestone[]) {
  for (const m of milestones) {
    // Payout status catch-up (webhooks also update this).
    if (m.status === "released" && m.payout_batch_id && !["SUCCESS", "DENIED", "CANCELED"].includes(m.payout_status ?? "")) {
      try {
        const b = await paypal.getPayoutBatch(m.payout_batch_id);
        if (b.batch_header.batch_status !== m.payout_status) {
          await patch(m.id, { payout_status: b.batch_header.batch_status });
          m.payout_status = b.batch_header.batch_status;
          if (b.batch_header.batch_status === "SUCCESS") {
            await addEvent(deal.id, m.id, "payout.completed", "PayPal", `Payout to ${deal.freelancer_name} completed`);
          }
        }
      } catch {
        /* non-fatal */
      }
    }
    // Silence is consent: a verdict nobody disputes settles itself after the review window.
    if (m.status === "verified" && m.verdict && m.verdict.recommendation !== "request_revision") {
      const age = (Date.now() - new Date(m.verdict.at).getTime()) / 3_600_000;
      if (age >= AUTO_SETTLE_HOURS) {
        try {
          await settle(deal, m, m.verdict.payoutAmount, `Auto-settled after ${AUTO_SETTLE_HOURS}h with no objection.`, "Fairhold");
        } catch {
          /* retried next view */
        }
      }
    }
  }
}

export async function getDealView(dealId: string, t: string | null) {
  const deal = await getDeal(dealId);
  if (!deal) return null;
  const role = roleFor(deal, t);
  let milestones = (await sql("SELECT * FROM milestones WHERE deal_id = $1 ORDER BY position", [dealId])).map(mapMilestone);
  if (paypal.paypalConfigured()) {
    await refreshBackground(deal, milestones);
    milestones = (await sql("SELECT * FROM milestones WHERE deal_id = $1 ORDER BY position", [dealId])).map(mapMilestone);
  }
  const events = (await sql("SELECT * FROM events WHERE deal_id = $1 ORDER BY id DESC LIMIT 200", [dealId])).map((e) => ({
    ...(e as unknown as DealEvent),
    id: Number(e.id),
    created_at: new Date(e.created_at as string).toISOString(),
  }));
   
  const { client_token, freelancer_token, ...publicDeal } = deal;
  return {
    deal: publicDeal as Deal,
    role,
    milestones,
    events,
    feePercent: feePercent(),
    links:
      role === "client" || deal.is_demo
        ? { client: `/deal/${deal.id}?t=${client_token}`, freelancer: `/deal/${deal.id}?t=${freelancer_token}` }
        : null,
  };
}

export async function ledger() {
  const rows = await sql(
    `SELECT m.*, d.title AS deal_title, d.currency, d.client_name, d.freelancer_name
       FROM milestones m JOIN deals d ON d.id = m.deal_id ORDER BY m.updated_at DESC LIMIT 500`,
  );
  return rows.map((r) => ({
    ...mapMilestone(r),
    deal_title: r.deal_title as string,
    currency: r.currency as string,
    client_name: r.client_name as string,
    freelancer_name: r.freelancer_name as string,
  }));
}
