import type { Metadata } from "next";
import { Check } from "lucide-react";
import { ApplyBand, PageHero } from "@/components/PageHero";
import { Container, PillLink, VerifyTag } from "@/components/ui";
import { PRODUCTS } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Products",
  description: "Working capital, term loans and lines of credit for small businesses, explained in plain terms.",
};

export default function ProductsPage() {
  return (
    <>
      <PageHero eyebrow="Products" title="Three ways to fund your business.">
        Each one works differently. Here&apos;s what they are, in plain terms. Apply once and a specialist will help
        you pick.
      </PageHero>

      <section className="py-14 sm:py-20">
        <Container className="space-y-5">
          {PRODUCTS.map((p) => (
            <article key={p.id} id={p.id} className="grid gap-6 rounded-3xl border-2 border-ink-100 bg-white p-6 sm:p-9 lg:grid-cols-[1.6fr_1fr]">
              <div>
                <p className="text-sm font-bold uppercase tracking-widest text-brand-700">{p.tab}</p>
                <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-ink-950 sm:text-3xl">{p.headline}</h2>
                <p className="mt-3 text-lg text-ink-600">{p.description}</p>
                <ul className="mt-5 space-y-2.5">
                  {p.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-3 text-ink-800">
                      <Check className="mt-1 h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" /> {b}
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-sm text-ink-500">{p.finePrint}</p>
              </div>
              <div className="flex flex-col justify-between gap-5 rounded-2xl bg-ink-50 p-6">
                <div>
                  <p className="text-sm font-semibold text-ink-600">
                    {p.exampleLabel} <VerifyTag k="products" className="ml-1" />
                  </p>
                  <p className="mt-1 text-4xl font-extrabold tracking-tight tabular-nums text-ink-950">{p.exampleAmount}</p>
                  <p className="mt-2 text-xs text-ink-500">Example only. Not a client result or an offer.</p>
                </div>
                <PillLink href="/apply">Apply now</PillLink>
              </div>
            </article>
          ))}
        </Container>
      </section>

      <ApplyBand />
    </>
  );
}
