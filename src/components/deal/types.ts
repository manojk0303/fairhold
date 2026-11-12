import type { Deal, DealEvent, Milestone, Role } from "@/lib/types";

export type DealView = {
  deal: Deal;
  role: Role;
  milestones: Milestone[];
  events: DealEvent[];
  feePercent: number;
  links: { client: string; freelancer: string } | null;
};

export type ActionFn = (milestoneId: string, action: string, body?: unknown) => Promise<unknown>;
