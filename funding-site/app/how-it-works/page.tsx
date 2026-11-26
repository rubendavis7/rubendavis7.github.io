import type { Metadata } from "next";
import { ApplyBand, PageHero } from "@/components/PageHero";
import { Qualification } from "@/components/Qualification";
import { Container, VerifyTag } from "@/components/ui";
import { TIMING } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "How it works",
  description: "What happens from the moment you apply to the moment funds reach your account.",
};

export default function HowItWorksPage() {
  const steps = [
    {
      title: "Apply",
      body: "Three short screens: your business, your revenue and how to reach you. No documents needed to start.",
      detail: ["Business name, industry and time in business", "Annual sales and how much you're looking for", "Your name, email and phone"],
      verify: false,
    },
    {
      title: "Talk to your specialist",
      body: `A specialist reviews what you sent and reaches out ${TIMING.specialistResponse}. They'll ask a few questions and tell you which product fits.`,
      detail: ["One person owns your file", "They'll ask for recent business bank statements", "Ask them anything. That's the job."],
      verify: true,
    },
    {
      title: "Get approved",
      body: "Your file goes through underwriting. If you're approved, you get the full terms in writing: amount, cost and how it's paid back.",
      detail: ["Approval isn't guaranteed", "You see the total cost before you sign", "No obligation to accept an offer"],
      verify: false,
    },
    {
      title: "Receive your funds",
      body: "Sign your agreement and the funds are sent to your business bank account.",
      detail: ["Funds go to your business account", "Your specialist stays your contact afterward"],
      verify: false,
    },
  ];

  return (
    <>
      <PageHero eyebrow="How it works" title="From application to funded, step by step.">
        No surprises. Here&apos;s what happens and what we&apos;ll ask you for.
      </PageHero>

      <section className="py-14 sm:py-20">
        <Container className="max-w-4xl">
          <ol className="space-y-4">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-4 rounded-3xl border-2 border-ink-100 bg-white p-6 sm:gap-6 sm:p-8">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-ink-950 text-xl font-extrabold text-white">
                  {i + 1}
                </span>
                <div>
                  <h2 className="text-xl font-extrabold text-ink-950 sm:text-2xl">{s.title}</h2>
                  <p className="mt-2 text-ink-600">
                    {s.body} {s.verify && <VerifyTag k="timing" />}
                  </p>
                  <ul className="mt-3 space-y-1.5 text-sm text-ink-700">
                    {s.detail.map((d) => (
                      <li key={d} className="flex gap-2">
                        <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" /> {d}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <Qualification />
      <ApplyBand />
    </>
  );
}
