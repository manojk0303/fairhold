import { json, fail, handle } from "@/lib/http";
import { sql } from "@/lib/db";

/**
 * Clears all agreements, milestones and activity (for resetting a demo).
 * Requires RESET_KEY to be set and passed as ?key=…  (disabled when RESET_KEY is unset).
 * Note: open PayPal sandbox authorizations are not voided; they simply expire.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const key = process.env.RESET_KEY;
    if (!key) return fail("Reset is disabled. Set RESET_KEY to enable it.", 403);
    if (new URL(req.url).searchParams.get("key") !== key) return fail("Wrong reset key", 403);
    await sql("DELETE FROM events");
    await sql("DELETE FROM milestones");
    await sql("DELETE FROM deals");
    return json({ ok: true });
  });
}
