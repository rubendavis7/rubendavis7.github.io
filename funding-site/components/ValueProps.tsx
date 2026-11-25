import { ArrowRight, Eye, Handshake, Zap } from "lucide-react";
import { PhotoSlot } from "./PhotoSlot";
import { Container, PillLink, SectionHeading } from "./ui";

const cards = [
  {
    icon: Zap,
    title: "Simple",
    body: "Three short steps to apply. No stack of paperwork to get started. Bank statements can come after.",
  },
  {
    icon: Handshake,
    title: "Personal",
    body: "One specialist owns your file. You get a name and a number that gets answered.",
  },
  {
    icon: Eye,
    title: "Transparent",
    body: "You see the amount, the factor rate and the total payback in writing before you sign anything.",
  },
];

export function ValueProps() {
  return (
    <section className="py-16 sm:py-24">
      <Container>
        <SectionHeading eyebrow="Why owners call us" title="Funding should be the easy part of your week." />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {cards.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-3xl bg-ink-50 p-7">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-brand-700 shadow-sm">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-xl font-extrabold text-ink-950">{title}</h3>
              <p className="mt-2 text-ink-600">{body}</p>
            </div>
          ))}
        </div>

        {/* Lifestyle photo card. Add src="/images/your-photo.jpg" to PhotoSlot to use a real photo. */}
        <PhotoSlot className="mt-4 rounded-3xl" alt="">
          <div className="absolute inset-0 -z-10 bg-ink-950/55" aria-hidden="true" />
          <div className="flex min-h-[320px] flex-col justify-end p-7 text-white sm:min-h-[380px] sm:p-12">
            <h3 className="max-w-xl text-3xl font-extrabold leading-tight tracking-tight text-balance sm:text-4xl">
              You run the business. We&apos;ll handle the funding legwork.
            </h3>
            <p className="mt-3 max-w-lg text-ink-100">
              Payroll, inventory, a repair that can&apos;t wait. Tell us what you need it for and we&apos;ll show you
              what&apos;s possible.
            </p>
            <div className="mt-6">
              <PillLink href="/apply" variant="bright">
                Apply now <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </PillLink>
            </div>
          </div>
        </PhotoSlot>
      </Container>
    </section>
  );
}
