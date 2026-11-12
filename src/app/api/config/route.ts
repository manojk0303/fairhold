import { json } from "@/lib/http";
import { paypalConfigured } from "@/lib/paypal";
import { llmInfo } from "@/lib/ai/llm";

export async function GET() {
  const llm = llmInfo();
  return json({
    paypalClientId: process.env.PAYPAL_CLIENT_ID ?? null,
    paypalReady: paypalConfigured(),
    aiReady: llm.ready,
    llmProvider: llm.provider,
    model: llm.model,
    database: process.env.DATABASE_URL ? "neon" : "pglite",
  });
}
