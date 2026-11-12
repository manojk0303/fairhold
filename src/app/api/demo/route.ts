import { json, handle } from "@/lib/http";
import { createDeal } from "@/lib/deals";
import { DEMO_BRIEF, DEMO_MILESTONES } from "@/lib/demo";

export async function POST() {
  return handle(async () => {
    const res = await createDeal({
      title: "Bloom & Rye bakery website",
      brief: DEMO_BRIEF,
      currency: "USD",
      clientName: "Maya (Bloom & Rye)",
      freelancerName: "Leo Okafor",
      freelancerEmail: process.env.DEMO_FREELANCER_EMAIL || "freelancer-demo@example.com",
      milestones: DEMO_MILESTONES,
      isDemo: true,
    });
    return json(res);
  });
}
