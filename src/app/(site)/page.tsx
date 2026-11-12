import Link from "next/link";
import { HeroCard } from "@/components/HeroCard";
import { DemoButton } from "@/components/DemoButton";

const STEPS = [
  {
    title: "Agree on what counts as done",
    body: "Describe the job in plain words. Fairhold’s AI turns it into milestones with weighted, checkable acceptance criteria that both sides sign off on before any money moves.",
  },
  {
    title: "The client’s money is held, not sent",
    body: "The client approves a PayPal authorization for each milestone. The funds are reserved on their account, so the freelancer knows the money exists and the client hasn’t paid yet.",
  },
  {
    title: "An AI reviewer checks the delivery",
    body: "The freelancer submits a link, a repo or a file. The verifier opens it, checks every criterion, and cites the evidence for each call.",
  },
  {
    title: "Exactly what was earned is released",
    body: "Fairhold captures the earned share and pays it out to the freelancer through PayPal Payouts. The rest of the hold is cancelled. Either side can object and get an AI mediator’s ruling.",
  },
];

export default function Home() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-12 sm:pt-20 pb-16 grid lg:grid-cols-[1.05fr_1fr] gap-10 lg:gap-14 items-center">
        <div>
          <h1 className="text-[2.6rem] sm:text-[3.4rem] leading-[1.02] font-extrabold tracking-[-0.03em] text-balance">
            Pay for work in proportion to what was delivered.
          </h1>
          <p className="mt-6 text-lg text-ink-2 max-w-[34rem] leading-relaxed">
            Fairhold holds the client’s payment in PayPal, has an AI reviewer check the work against criteria both sides
            agreed on up front, and releases exactly the share that was earned. Not all, not nothing.
          </p>
          <div className="mt-8 flex flex-wrap items-start gap-3">
            <DemoButton />
            <Link href="/new" className="btn btn-ghost">
              Write your own agreement
            </Link>
          </div>
          <p className="mt-4 text-sm text-ink-3">The demo runs on the PayPal sandbox with a test buyer account.</p>
        </div>
        <HeroCard />
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-14 grid md:grid-cols-[1fr_2fr] gap-10">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Freelance work fails on trust in both directions</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-8 text-ink-2 leading-relaxed">
            <p>
              <b className="text-ink">Freelancers do the work and don’t get paid.</b> In IPSE’s survey of UK self-employed
              workers, 31% had finished work and never been paid for it. Asking for money up front scares good clients away.
            </p>
            <p>
              <b className="text-ink">Clients pay and get half a job.</b> Escrow services only know two outcomes, release
              everything or refund everything, so every disagreement turns into a fight over the whole amount.
            </p>
            <p>
              <b className="text-ink">Most disputes are really scope disputes.</b> “Make it responsive” means different things
              to different people. Fairhold pins scope down before work starts, in criteria a machine can check.
            </p>
            <p>
              <b className="text-ink">Partial delivery deserves partial payment.</b> PayPal’s partial capture lets Fairhold pay
              exactly the earned share and cancel the rest of the hold in one step.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-16">
        <h2 className="text-2xl font-bold tracking-tight">How a milestone moves</h2>
        <ol className="mt-8 grid md:grid-cols-4 gap-6">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative pl-0">
              <div className="flex items-center gap-3">
                <span className="h-8 w-8 rounded-full border border-ink/20 flex items-center justify-center text-sm font-bold num">
                  {i + 1}
                </span>
                <span className="h-px flex-1 bg-line hidden md:block" />
              </div>
              <h3 className="mt-4 font-semibold leading-snug">{s.title}</h3>
              <p className="mt-2 text-sm text-ink-2 leading-relaxed">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="panel p-6 sm:p-8 grid md:grid-cols-3 gap-8">
          <div>
            <h2 className="text-xl font-bold tracking-tight">AI judges the evidence. Code moves the money.</h2>
            <p className="mt-3 text-sm text-ink-2 leading-relaxed">
              The model never picks a dollar figure. It rates each criterion with cited evidence; Fairhold computes the payout
              from the weights both sides agreed to, and every step lands in an audit trail.
            </p>
          </div>
          <dl className="md:col-span-2 grid sm:grid-cols-2 gap-x-8 gap-y-5 text-sm">
            {[
              ["PayPal Orders v2, intent AUTHORIZE", "Funds the hold for each milestone with the PayPal JS SDK v6 button."],
              ["Authorizations: partial capture and void", "Captures the earned share with final_capture; voids holds when nothing was earned."],
              ["PayPal Payouts", "Pays the freelancer’s share, less a 3% platform fee, to their PayPal account."],
              ["Webhooks", "Payout, capture and authorization events from PayPal are verified and written to the timeline."],
              ["PayPal Agent Toolkit", "The mediator confirms order facts with PayPal tools; the operations copilot queries transactions, disputes and invoices."],
              ["Open LLM agents (gpt-oss-120b on Groq)", "Compile scope into criteria, run the evidence-gathering verifier, and mediate disputes, all through tool calling."],
            ].map(([t, d]) => (
              <div key={t}>
                <dt className="font-semibold">{t}</dt>
                <dd className="text-ink-2 mt-1 leading-relaxed">{d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
  );
}
