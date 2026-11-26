import Link from "next/link";
import type { ReactNode } from "react";
import { Container } from "./ui";

/** Dark header band used at the top of inner pages. */
export function PageHero({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <section className="bg-ink-gradient text-white">
      <Container className="py-12 sm:py-16">
        <p className="text-sm font-bold uppercase tracking-widest text-brand-400">{eyebrow}</p>
        <h1 className="mt-2 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-balance sm:text-5xl">{title}</h1>
        {children && <p className="mt-4 max-w-2xl text-lg text-ink-200">{children}</p>}
      </Container>
    </section>
  );
}

/** Closing call-to-action band shared by inner pages. */
export function ApplyBand() {
  return (
    <section className="bg-ink-50 py-14">
      <Container className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-ink-950 sm:text-3xl">Ready when you are.</h2>
          <p className="mt-1 text-ink-600">Three short steps. Documents can come later.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link href="/apply" className="inline-flex h-14 items-center justify-center rounded-full bg-brand-700 px-8 text-base font-semibold text-white transition-colors hover:bg-brand-800">
            Apply now
          </Link>
          <Link href="/calculator" className="inline-flex h-14 items-center justify-center rounded-full border-2 border-ink-900 px-8 text-base font-semibold text-ink-900 transition-colors hover:bg-ink-900 hover:text-white">
            Funding Calculator
          </Link>
        </div>
      </Container>
    </section>
  );
}
