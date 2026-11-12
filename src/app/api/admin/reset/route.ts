import { json, fail, handle } from "@/lib/http";
import { sql } from "@/lib/db";
import { voidAuthorization, paypalConfigured } from "@/lib/paypal";

/**
 * Clears all agreements, milestones and activity (for resetting a demo).
 * Open PayPal holds are voided first, so the sandbox buyer's reserved funds are released.
 * Requires RESET_KEY to be set and passed as ?key=…  (disabled when RESET_KEY is unset).
 */
export async function POST(req: Request) {
  return handle(async () => {
    const key = process.env.RESET_KEY;
    if (!key) return fail("Reset is disabled. Set RESET_KEY to enable it.", 403);
    if (new URL(req.url).searchParams.get("key") !== key) return fail("Wrong reset key", 403);

    let voided = 0;
    if (paypalConfigured()) {
      const open = await sql<{ authorization_id: string }>(
        "SELECT authorization_id FROM milestones WHERE authorization_id IS NOT NULL AND capture_id IS NULL AND status <> 'refunded'",
      );
      for (const r of open) {
        try {
          await voidAuthorization(r.authorization_id);
          voided++;
        } catch {
          /* already voided/expired: ignore */
        }
      }
    }
    await sql("DELETE FROM events");
    await sql("DELETE FROM milestones");
    await sql("DELETE FROM deals");
    return json({ ok: true, voidedHolds: voided });
  });
}
