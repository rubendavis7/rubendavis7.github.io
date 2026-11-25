import { ArrowRight, Check } from "lucide-react";
import { PhoneCarousel } from "./PhoneCarousel";
import { Container, PillLink } from "./ui";

const points = ["Takes a few minutes", "Documents can come later", "A real person reviews every file"];

export function Hero() {
  return (
    <section className="bg-ink-gradient text-white">
      <Container className="grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.15fr_1fr] lg:py-24">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-brand-400">Business funding</p>
          <h1 className="mt-3 text-4xl font-extrabold leading-[1.05] tracking-tight text-balance sm:text-6xl">
            Funding without the runaround.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-ink-200 sm:text-xl">
            Tell us about your business in three short steps. A specialist looks at your numbers and calls you with
            a straight answer.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <PillLink href="/apply" variant="bright" size="lg">
              Apply now <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </PillLink>
            <PillLink href="/#calculator" variant="outlineLight" size="lg">
              Estimate my funding
            </PillLink>
          </div>
          <ul className="mt-8 flex flex-col gap-2.5 text-sm text-ink-200 sm:flex-row sm:flex-wrap sm:gap-x-6">
            {points.map((p) => (
              <li key={p} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-brand-400" aria-hidden="true" /> {p}
              </li>
            ))}
          </ul>
        </div>
        <PhoneCarousel />
      </Container>
    </section>
  );
}
