import { json, handle } from "@/lib/http";
import { ledger } from "@/lib/deals";

export async function GET() {
  return handle(async () => json({ rows: await ledger() }));
}
