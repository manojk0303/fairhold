import { json, fail, handle } from "@/lib/http";
import { sql, one } from "@/lib/db";
import { verifyWebhook } from "@/lib/paypal";
import { addEvent } from "@/lib/deals";

/**
 * PayPal webhooks keep the ledger in sync with what actually happened at PayPal
 * (authorizations voided/expired, captures completed, payouts succeeded or failed).
 */
export async function POST(req: Request) {
  return handle(async () => {
    const event = await req.json();
    if (process.env.PAYPAL_WEBHOOK_ID) {
      const ok = await verifyWebhook(req.headers, event);
      if (!ok) return fail("Invalid webhook signature", 401);
    }
    const type: string = event.event_type ?? "";
    const r = event.resource ?? {};

    let m: Record<string, unknown> | null = null;
    if (type.startsWith("PAYMENT.PAYOUTS")) {
      const batchId = r.payout_batch_id ?? r.batch_header?.payout_batch_id;
      if (batchId) {
        const status = r.transaction_status ?? r.batch_header?.batch_status ?? type.split(".").pop();
        m = await one("UPDATE milestones SET payout_status = $2, updated_at = now() WHERE payout_batch_id = $1 RETURNING id, deal_id", [batchId, status]);
      }
    } else if (type.startsWith("PAYMENT.AUTHORIZATION")) {
      m = await one("SELECT id, deal_id FROM milestones WHERE authorization_id = $1", [r.id]);
    } else if (type.startsWith("PAYMENT.CAPTURE")) {
      const authId = r.supplementary_data?.related_ids?.authorization_id;
      m = await one("SELECT id, deal_id FROM milestones WHERE capture_id = $1 OR authorization_id = $2", [r.id, authId ?? ""]);
    } else if (type.startsWith("CHECKOUT.ORDER")) {
      m = await one("SELECT id, deal_id FROM milestones WHERE paypal_order_id = $1", [r.id]);
    }

    if (m) {
      await addEvent(m.deal_id as string, m.id as string, "paypal.webhook", "PayPal", `PayPal confirmed ${type.toLowerCase().replace(/[._-]/g, " ")}`, {
        eventId: event.id,
        type,
      });
    } else {
      await sql("SELECT 1"); // keep handler warm; unknown events are acknowledged
    }
    return json({ received: true });
  });
}
