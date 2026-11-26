import type { Metadata } from "next";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { ApplyBand, PageHero } from "@/components/PageHero";
import { Container, VerifyTag } from "@/components/ui";
import { QUALIFICATION, TIMING } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Straight answers to common questions about business funding and merchant cash advances.",
};

const faqs: { q: string; a: ReactNode }[] = [
  {
    q: "Is a merchant cash advance a loan?",
    a: "No. It's a purchase of a portion of your future receivables. You get a lump sum now, and you deliver the purchased amount through a share of your sales. It has no interest rate or APR.",
  },
  {
    q: "What is a factor rate?",
    a: "It's the number that sets the total you pay back on a merchant cash advance. Multiply the advance by the factor rate to get the total. Example math only, not our pricing: a $10,000 advance at a 1.30 factor rate means $13,000 in total. Your factor rate is set in underwriting.",
  },
  {
    q: "How do I pay it back?",
    a: "With a merchant cash advance, a set share of your sales is remitted daily or weekly until the purchased amount is delivered. Term loans and lines of credit, offered through our lending partners, follow the lender's payment schedule.",
  },
  {
    q: "What do I need to apply?",
    a: (
      <>
        Basic details about your business and how to reach you. If it looks like a fit, your specialist will ask for{" "}
        {QUALIFICATION[3].value} of business bank statements. <VerifyTag k="qualification" />
      </>
    ),
  },
  {
    q: "How fast is it?",
    a: (
      <>
        A specialist reaches out {TIMING.specialistResponse} of your application. <VerifyTag k="timing" /> How long a
        decision and funding take depends on underwriting and how quickly we get your documents. We won&apos;t promise
        a timeline before your file is reviewed.
      </>
    ),
  },
  {
    q: "How much can I get?",
    a: "It depends on your sales, your time in business and what underwriting finds. The funding calculator gives a rough estimate. It isn't an offer.",
  },
  {
    q: "My business isn't open yet. Can I apply?",
    a: "Most funding needs a business that's open with revenue coming in. You can still apply, and a specialist will tell you what to line up first.",
  },
  {
    q: "If I apply, do I have to take the offer?",
    a: "No. Applying doesn't obligate you to accept funding. You'll see the full terms in writing before you decide.",
  },
  {
    q: "Who sees my information?",
    a: "The people working your file, plus funding partners and lenders when that's needed to get you an offer. We don't sell your information. See the Privacy Policy for details.",
  },
  {
    q: "Is approval guaranteed?",
    a: "No. Every file goes through underwriting, and not every business qualifies.",
  },
];

export default function FaqPage() {
  return (
    <>
      <PageHero eyebrow="FAQ" title="Straight answers.">
        The questions owners ask us most. Don&apos;t see yours? Call us.
      </PageHero>

      <section className="py-14 sm:py-20">
        <Container className="max-w-3xl space-y-3">
          {faqs.map((f) => (
            <details key={f.q} className="group rounded-2xl border-2 border-ink-100 bg-white open:border-ink-300">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-lg font-bold text-ink-950 [&::-webkit-details-marker]:hidden">
                {f.q}
                <ChevronDown className="h-5 w-5 shrink-0 text-ink-500 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="px-5 pb-5 text-ink-700">{f.a}</p>
            </details>
          ))}
        </Container>
      </section>

      <ApplyBand />
    </>
  );
}
