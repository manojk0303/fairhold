# Fairhold

**Milestone payments that release in proportion to what was delivered.**

Fairhold holds a client's payment in PayPal, has an AI reviewer check the delivered work against acceptance
criteria both sides agreed on up front, and releases exactly the earned share. Not all, not nothing.

- **Live demo:** `https://<your-deployment>.vercel.app` (click **Try the bakery demo**)
- **Video (under 3 min):** `https://youtu.be/<id>`
- Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/) on the PayPal **sandbox**. No real money moves.

---

## The problem

Freelance work breaks down over trust in both directions:

- **Freelancers finish work and don't get paid.** In IPSE's survey of UK self-employed workers, 31% had completed
  work and never been paid for it.
- **Clients pay and get half a job.** Escrow only knows two outcomes, release everything or refund everything, so
  every disagreement becomes a fight over the whole amount.
- **Most disputes are scope disputes.** "Make it responsive" means different things to different people.

## What Fairhold does

1. **Agree on proof.** The client describes the job in plain words. An LLM agent compiles it into milestones with
   weighted, *machine-checkable* acceptance criteria (and flags ambiguities to settle first). Both sides edit and
   accept them before money moves.
2. **Hold the money.** The client approves a PayPal order with `intent: AUTHORIZE` for each milestone via the
   **PayPal JS SDK v6** button. Funds are reserved on the client's account but not charged.
3. **Verify the delivery.** The freelancer submits a live URL, a GitHub repo, an image and/or notes. An AI verifier
   agent opens every link, follows up on pages and files as needed, and rules on each criterion
   (`met` / `partial` / `unmet`) with cited evidence. Progress streams into the UI.
4. **Release exactly what was earned.** Fairhold computes the payout from the agreed weights, **partially captures**
   that amount from the authorization (`final_capture: true` releases the rest of the hold), and pays the freelancer
   through **PayPal Payouts**, less a 3% platform fee.
5. **Object and mediate.** Either side can object. Both submit statements; an AI mediator agent confirms the payment
   facts with **PayPal Agent Toolkit** tools, re-checks the evidence, and issues a ruling that Fairhold executes.
   A verdict nobody disputes settles automatically after 72 hours.

An **Operations** console shows every hold, verdict and payout in an **AG Grid** ledger, plus a copilot (LLM agent +
PayPal Agent Toolkit) that answers questions like "match recent PayPal transactions to Fairhold captures."

### Design principle: AI judges evidence, code moves money

The model never chooses a dollar amount. It rates criteria with evidence; deterministic code turns the agreed
weights into a payout; PayPal calls are idempotent (`PayPal-Request-Id`) and every state change is an atomic SQL
transition, so a double click can't double-capture. Every step lands in the audit timeline.

---

## How PayPal is used

| Capability | Where | What it does |
| --- | --- | --- |
| **Orders v2** `intent: AUTHORIZE` | [`src/lib/paypal.ts`](src/lib/paypal.ts) `createHoldOrder` / `authorizeOrder` | Funds a milestone hold without charging the client |
| **JS SDK v6** (`@paypal/react-paypal-js/sdk-v6`) | [`MilestoneCard.tsx`](src/components/deal/MilestoneCard.tsx) | `PayPalOneTimePaymentButton` approves the hold |
| **Authorizations: partial capture** | `captureAuthorization` | Captures exactly the earned share; `final_capture` frees the remainder |
| **Authorizations: void** | `voidAuthorization` | Cancels the hold when nothing was earned |
| **Payouts v1** | `sendPayout`, `getPayoutBatch` | Pays the freelancer's share to their PayPal account; status is polled and reconciled |
| **Webhooks** + signature verification | [`api/paypal/webhook`](src/app/api/paypal/webhook/route.ts) | Payout/capture/authorization events land in the timeline |
| **PayPal Agent Toolkit** (`@paypal/agent-toolkit`) | [`src/lib/ai/paypal-tools.ts`](src/lib/ai/paypal-tools.ts) | Toolkit tools are bridged into OpenAI-style function tools for the mediator (`get_order`) and the ops copilot (transactions, disputes, invoices, refunds, insights) |

## How AI is used

All four agents run on one small provider-neutral tool-calling loop ([`src/lib/ai/llm.ts`](src/lib/ai/llm.ts)) over the
OpenAI-compatible Chat Completions API, so Fairhold runs on **free tiers**: Groq (`openai/gpt-oss-120b`, default),
Google Gemini (`gemini-2.5-flash`, which can also see uploaded images) or OpenRouter. Set whichever key you have.

| Agent | File | Technique |
| --- | --- | --- |
| **Scope compiler** | [`src/lib/ai/scope.ts`](src/lib/ai/scope.ts) | Schema-validated tool call (Zod) turns a brief into milestones, weighted criteria and open questions |
| **Deliverable verifier** | [`src/lib/ai/verify.ts`](src/lib/ai/verify.ts) | Tool-use agent with `inspect_web_page`, `inspect_github_repo`, `read_github_file`, image facts (vision on Gemini) and a `record_verdict` tool |
| **Dispute mediator** | [`src/lib/ai/mediate.ts`](src/lib/ai/mediate.ts) | Tool-use agent with PayPal Agent Toolkit tools plus evidence tools; issues a binding split |
| **Operations copilot** | [`src/lib/ai/copilot.ts`](src/lib/ai/copilot.ts) | Chat agent over PayPal Agent Toolkit tools and Fairhold's ledger |

Every tool call's arguments are validated against a Zod schema; invalid calls are returned to the model to fix.
Free-tier rate limits are handled with retry-after backoff and by capping tool output size.

--- | --- | --- |
| **Scope compiler** | [`src/lib/ai/scope.ts`](src/lib/ai/scope.ts) | Structured outputs (Zod schema) turn a brief into milestones, weighted criteria and open questions |
| **Deliverable verifier** | [`src/lib/ai/verify.ts`](src/lib/ai/verify.ts) | Tool-use agent (SDK tool runner) with `inspect_web_page`, `inspect_github_repo`, `read_github_file`, vision on uploaded images, and a strict `record_verdict` tool |
| **Dispute mediator** | [`src/lib/ai/mediate.ts`](src/lib/ai/mediate.ts) | Tool-use agent with PayPal Agent Toolkit tools plus evidence tools; issues a binding split |
| **Operations copilot** | [`src/lib/ai/copilot.ts`](src/lib/ai/copilot.ts) | Chat agent over PayPal Agent Toolkit tools and Fairhold's ledger |

Model: `claude-opus-5-5` by default (override with `CLAUDE_MODEL`), with server-side refusal fallback enabled.

---

## Run it locally (about 5 minutes)

**Prerequisites:** Node 20+, a free [PayPal Developer](https://developer.paypal.com/) account, a free LLM key from
[Groq](https://console.groq.com/keys), [Google AI Studio](https://aistudio.google.com/apikey) or [OpenRouter](https://openrouter.ai/keys).

```bash
git clone <this repo> && cd fairhold
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev                  # http://localhost:3000
```

| Variable | Where to get it |
| --- | --- |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | Developer Dashboard → Apps & Credentials → **Sandbox** → your app |
| `GROQ_API_KEY` *or* `GEMINI_API_KEY` *or* `OPENROUTER_API_KEY` | Any one. Optional `LLM_PROVIDER` / `LLM_MODEL` to override |
| `DEMO_FREELANCER_EMAIL` | Developer Dashboard → Sandbox → **Accounts** → the default *Personal* account's email (receives demo payouts) |
| `DATABASE_URL` | Optional locally. Empty = embedded PGlite in `./.data`. Use a [Neon](https://neon.com) URL in production |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` locally; your deployed URL in production |

**Paying in the demo:** when the PayPal window opens, sign in with a sandbox **Personal** account from
Developer Dashboard → Sandbox → Accounts (view its email and password there).

### Walk through the demo

1. Home → **Try the bakery demo**. You're the client, Maya.
2. Milestone 1 → PayPal button → approve with the sandbox buyer. $240 is now *held*.
3. Switch to **Freelancer · Leo** → **Use the sample bakery site** → **Submit for AI review**. Watch the verifier work.
   The sample site deliberately misses the contact form's message field and one alt text, so it scores about 70%.
4. Either resubmit **the fixed version** (scores 100%), or switch back to Maya → **Release**. PayPal captures the
   earned share, the rest of the hold is released, and Leo is paid via Payouts.
5. Try **Object to this verdict** on milestone 2 to see the mediator rule.
6. Open **Operations** for the AG Grid ledger and ask the copilot about the money.

## Deploy (free tiers)

1. Create a **Neon** project and copy its connection string. Tables are created automatically on first request.
2. Import the repo into **Vercel**. Set the env vars above (`NEXT_PUBLIC_APP_URL` = your Vercel URL).
3. Optional: in the PayPal Developer Dashboard add a webhook to `https://<app>/api/paypal/webhook` for
   `PAYMENT.AUTHORIZATION.*`, `PAYMENT.CAPTURE.*` and `PAYMENT.PAYOUTS*` events, and set `PAYPAL_WEBHOOK_ID`.

## Project layout

```
src/lib/paypal.ts          PayPal REST client (orders, authorizations, payouts, webhooks)
src/lib/deals.ts           Agreement state machine, settlement, mediation orchestration
src/lib/ai/                Scope compiler, verifier, mediator, copilot, Agent Toolkit bridge, evidence tools
src/app/api/               Route handlers
src/app/(site)/            Landing, new agreement, deal room, operations
src/app/samples/           Sample freelancer deliverable used by the demo
```

## Limitations and next steps

- Sandbox only. Authorizations are honoured for 3 days (valid 29); long milestones would need reauthorization or
  vaulted payment methods.
- Party links are bearer tokens; a production version would use real accounts.
- The verifier can only judge what is publicly reachable; private repos and staging sites need access grants.
- Next: Multiparty/platform fees instead of capture-then-payout, reviewer calibration evals, and appeals to
  PayPal's Resolution Center.

## License

[MIT](LICENSE)
