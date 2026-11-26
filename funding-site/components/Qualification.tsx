import { QUALIFICATION } from "@/lib/site-config";
import { Container, PillLink, SectionHeading, VerifyTag } from "./ui";

export function Qualification() {
  return (
    <section id="qualify" className="bg-ink-50 py-16 sm:py-24">
      <Container>
        <SectionHeading eyebrow="Do I qualify?" title="The short list.">
          These are the minimums to get a file reviewed. Meeting them isn&apos;t an approval, and missing one
          isn&apos;t always a no. <VerifyTag k="qualification" />
        </SectionHeading>

        <dl className="mt-10 grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-4">
          {QUALIFICATION.map((q) => (
            <div key={q.label} className="flex flex-col-reverse justify-end rounded-3xl bg-white p-6 sm:p-7">
              <dt>
                <span className="mt-2 block text-base font-bold text-ink-950">{q.label}</span>
                <span className="mt-1 block text-sm text-ink-600">{q.note}</span>
              </dt>
              <dd className="text-4xl font-extrabold leading-none tracking-tight text-ink-950 sm:text-5xl">{q.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <PillLink href="/apply" size="lg">Apply now</PillLink>
          <PillLink href="/#calculator" variant="outline" size="lg">Funding Calculator</PillLink>
        </div>
      </Container>
    </section>
  );
}
