import type { Metadata } from "next";
import { Eye, Handshake, PhoneCall, Zap } from "lucide-react";
import { ApplyBand, PageHero } from "@/components/PageHero";
import { Container, VerifyTag } from "@/components/ui";
import { ABOUT, BRAND } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "About us",
  description: `Who ${BRAND.name} is and how we work with business owners.`,
};

const principles = [
  { icon: PhoneCall, title: "We pick up the phone", body: "You get a person, a name and a number. Not a ticket queue." },
  { icon: Eye, title: "We show the full cost", body: "Amount, factor rate and total payback, in writing, before you sign." },
  { icon: Zap, title: "We keep it short", body: "Three steps to apply. We only ask for documents when we need them." },
  { icon: Handshake, title: "We tell you the truth", body: "If it's not a fit, we say so. If something won't work, you hear it from us first." },
];

export default function AboutPage() {
  return (
    <>
      <PageHero eyebrow="About us" title="Funding people who run real businesses.">
        {BRAND.tagline}
      </PageHero>

      <section className="py-14 sm:py-20">
        <Container className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-ink-950 sm:text-3xl">
              Our story <VerifyTag k="about" className="ml-1" />
            </h2>
            <div className="mt-4 space-y-4 text-lg text-ink-600">
              {ABOUT.story.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-ink-950 sm:text-3xl">How we work</h2>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2">
              {principles.map(({ icon: Icon, title, body }) => (
                <li key={title} className="rounded-3xl bg-ink-50 p-6">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-brand-700 shadow-sm">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-lg font-extrabold text-ink-950">{title}</h3>
                  <p className="mt-1 text-ink-600">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      <ApplyBand />
    </>
  );
}
