import { Calculator } from "./Calculator";
import { Container, SectionHeading } from "./ui";

export function CalculatorSection({ as = "h2" }: { as?: "h1" | "h2" }) {
  return (
    <section id="calculator" className="py-16 sm:py-24">
      <Container>
        {as === "h1" ? (
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-widest text-brand-700">Funding calculator</p>
            <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-ink-950 text-balance sm:text-5xl">
              See what your sales could support.
            </h1>
            <p className="mt-4 text-lg text-ink-600">Two inputs. No sign-up. It takes about ten seconds.</p>
          </div>
        ) : (
          <SectionHeading eyebrow="Funding calculator" title="See what your sales could support.">
            Two inputs. No sign-up. It takes about ten seconds.
          </SectionHeading>
        )}
        <div className="mt-10">
          <Calculator />
        </div>
      </Container>
    </section>
  );
}
