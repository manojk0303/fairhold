export type Role = "client" | "freelancer" | "viewer";

export type Criterion = {
  id: string;
  text: string;
  weight: number; // 1-5
  check: "page" | "repo" | "image" | "text";
};

export type CriterionResult = {
  id: string;
  outcome: "met" | "partial" | "unmet";
  credit: number; // 0..1
  evidence: string;
  reasoning: string;
};

export type Verdict = {
  score: number; // 0..1 weighted
  payoutAmount: number;
  recommendation: "release_full" | "release_partial" | "request_revision";
  summary: string;
  results: CriterionResult[];
  model: string;
  at: string;
  steps: string[];
};

export type Submission = {
  notes: string;
  links: string[];
  image?: { name: string; mediaType: string; dataUrl: string } | null;
  at: string;
};

export type Dispute = {
  openedBy: "client" | "freelancer";
  statements: { by: "client" | "freelancer"; text: string; at: string }[];
  status: "open" | "ruled";
};

export type Ruling = {
  payoutAmount: number;
  percentToFreelancer: number;
  rationale: string;
  findings: string[];
  paypalChecks: string[];
  model: string;
  at: string;
};

export type MilestoneStatus =
  | "awaiting_funds"
  | "funded"
  | "verifying"
  | "verified"
  | "disputed"
  | "settling"
  | "released"
  | "refunded";

export type Milestone = {
  id: string;
  deal_id: string;
  position: number;
  title: string;
  summary: string;
  amount: number;
  criteria: Criterion[];
  status: MilestoneStatus;
  paypal_order_id: string | null;
  authorization_id: string | null;
  auth_expires_at: string | null;
  capture_id: string | null;
  captured_amount: number | null;
  fee_amount: number | null;
  payout_amount: number | null;
  payout_batch_id: string | null;
  payout_status: string | null;
  submission: Submission | null;
  verdict: Verdict | null;
  dispute: Dispute | null;
  ruling: Ruling | null;
  attempts: number;
  updated_at: string;
};

export type Deal = {
  id: string;
  title: string;
  brief: string;
  currency: string;
  total: number;
  client_name: string;
  freelancer_name: string;
  freelancer_email: string;
  is_demo: boolean;
  created_at: string;
};

export type DealEvent = {
  id: number;
  deal_id: string;
  milestone_id: string | null;
  kind: string;
  actor: string;
  message: string;
  data: Record<string, unknown> | null;
  created_at: string;
};

export type MilestoneDraft = {
  title: string;
  summary: string;
  amount: number;
  criteria: Criterion[];
};
