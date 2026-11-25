import { TIMING } from "@/lib/site-config";
import { Container, PillLink, SectionHeading, VerifyTag } from "./ui";

export function Steps() {
  const steps = [
    {
      title: "Apply",
      body: "Three short screens about your business, your revenue and how to reach you. No documents needed to start.",
      verify: false,
    },
    {
      title: "Get approved",
      body: `A specialist reviews your file and reaches out ${TIMING.specialistResponse}. If you're approved, you see the full terms in writing.`,
      verify: true,
    },
    {
      title: "Receive your funds",
      body: "Sign your agreement and the funds are sent to your business bank account.",
      verify: false,
    },
  ];

  return (
    <section id="how-it-works" className="py-16 sm:py-24">
      <Container>
        <SectionHeading eyebrow="How it works" title="Three steps. That's it." />
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="relative rounded-3xl border-2 border-ink-100 bg-white p-7">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-950 text-2xl font-extrabold text-white">
                {i + 1}
              </span>
              <h3 className="mt-5 text-xl font-extrabold text-ink-950">{s.title}</h3>
              <p className="mt-2 text-ink-600">
                {s.body} {s.verify && <VerifyTag k="timing" />}
              </p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-ink-500">Approval isn&apos;t guaranteed. Every file goes through underwriting.</p>
        <div className="mt-8">
          <PillLink href="/apply" size="lg">Start my application</PillLink>
        </div>
      </Container>
    </section>
  );
}
