import type { Metadata } from "next";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { ApplyBand, PageHero } from "@/components/PageHero";
import { Container, VerifyTag } from "@/components/ui";
import { BRAND, CONTACT } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Contact",
  description: `Call, email or write to ${BRAND.name}.`,
};

export default function ContactPage() {
  const items = [
    {
      icon: Phone,
      label: "Call",
      value: CONTACT.phoneDisplay,
      href: CONTACT.phoneHref ? `tel:${CONTACT.phoneHref}` : undefined,
      note: "The fastest way to get an answer.",
    },
    {
      icon: Mail,
      label: "Email",
      value: CONTACT.email,
      href: CONTACT.emailHref ? `mailto:${CONTACT.emailHref}` : undefined,
      note: "Please don't email bank statements unless your specialist asks.",
    },
    { icon: MapPin, label: "Mail", value: CONTACT.addressLines.join(", "), href: undefined, note: BRAND.name },
    { icon: Clock, label: "Hours", value: CONTACT.hours, href: undefined, note: "Applications are open any time." },
  ];

  return (
    <>
      <PageHero eyebrow="Contact" title="Talk to a person.">
        Questions before you apply? Reach us any of these ways.
      </PageHero>

      <section className="py-14 sm:py-20">
        <Container className="max-w-4xl">
          <p className="mb-4">
            <VerifyTag k="contact" />
          </p>
          <ul className="grid gap-4 sm:grid-cols-2">
            {items.map(({ icon: Icon, label, value, href, note }) => (
              <li key={label} className="rounded-3xl border-2 border-ink-100 bg-white p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink-950 text-white">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h2 className="mt-4 text-sm font-bold uppercase tracking-widest text-ink-600">{label}</h2>
                {href ? (
                  <a href={href} className="mt-1 block break-words text-xl font-extrabold text-ink-950 hover:text-brand-700">
                    {value}
                  </a>
                ) : (
                  <p className="mt-1 break-words text-xl font-extrabold text-ink-950">{value}</p>
                )}
                <p className="mt-2 text-sm text-ink-600">{note}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <ApplyBand />
    </>
  );
}
