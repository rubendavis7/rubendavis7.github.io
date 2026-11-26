import { Mail, MapPin, Phone } from "lucide-react";
import Link from "next/link";
import { BRAND, CONTACT, DISCLAIMERS, LEGAL_LINKS, NAV_LINKS } from "@/lib/site-config";
import { Container, Logo, VerifyTag } from "./ui";

export function Footer() {
  return (
    <footer className="bg-ink-gradient text-ink-200">
      <Container className="py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo light />
            <p className="mt-4 max-w-xs text-ink-300">{BRAND.tagline}</p>
            <ul className="mt-6 space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" aria-hidden="true" />
                {CONTACT.phoneHref ? (
                  <a href={`tel:${CONTACT.phoneHref}`} className="hover:text-white">{CONTACT.phoneDisplay}</a>
                ) : (
                  <span>{CONTACT.phoneDisplay}</span>
                )}
              </li>
              <li className="flex items-start gap-3">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" aria-hidden="true" />
                {CONTACT.emailHref ? (
                  <a href={`mailto:${CONTACT.emailHref}`} className="break-all hover:text-white">{CONTACT.email}</a>
                ) : (
                  <span>{CONTACT.email}</span>
                )}
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" aria-hidden="true" />
                <address className="not-italic">
                  {CONTACT.addressLines.map((line) => (
                    <span key={line} className="block">{line}</span>
                  ))}
                  <span className="mt-1 block text-ink-400">{CONTACT.hours}</span>
                </address>
              </li>
            </ul>
            <VerifyTag k="contact" className="mt-3" />
          </div>

          <nav aria-label="Footer">
            <h2 className="text-sm font-bold uppercase tracking-widest text-white">Explore</h2>
            <ul className="mt-4 space-y-3 text-sm">
              {NAV_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="hover:text-white">{l.label}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Legal">
            <h2 className="text-sm font-bold uppercase tracking-widest text-white">Legal</h2>
            <ul className="mt-4 space-y-3 text-sm">
              {LEGAL_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="hover:text-white">{l.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-12 space-y-3 border-t border-white/10 pt-8 text-xs leading-relaxed text-ink-400">
          {DISCLAIMERS.map((d) => (
            <p key={d}>{d}</p>
          ))}
          <p className="pt-2 text-ink-300">
            © {BRAND.name}. All rights reserved.
          </p>
        </div>
      </Container>
    </footer>
  );
}
