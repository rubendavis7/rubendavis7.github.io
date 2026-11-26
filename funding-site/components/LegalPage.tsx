import type { ReactNode } from "react";
import { Container } from "./ui";

/** Shared layout for Privacy, Terms and Disclosures. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="py-12 sm:py-16">
      <Container className="max-w-3xl">
        <h1 className="text-4xl font-extrabold tracking-tight text-ink-950">{title}</h1>
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <strong>[VERIFY] Template text.</strong> This page is a starting draft and is not legal advice. Have your
          attorney review and finish it before the site goes live.
        </p>
        <div className="mt-8 space-y-6 text-ink-700 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-extrabold [&_h2]:text-ink-950 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
          {children}
        </div>
      </Container>
    </section>
  );
}
