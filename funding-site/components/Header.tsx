"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Menu, Phone, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CONTACT, NAV_LINKS } from "@/lib/site-config";
import { Container, Logo, PillLink, VerifyTag } from "./ui";

export function Header() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-ink-100 bg-white/95 backdrop-blur">
      <Container className="flex h-16 items-center justify-between gap-2">
        <Link href="/" aria-label="Delta Capital Group home" className="shrink-0 rounded-lg" onClick={() => setOpen(false)}>
          <Logo />
        </Link>

        <div className="flex items-center gap-1.5 sm:gap-3">
          <PillLink href="/#calculator" variant="outline" size="sm" className="max-sm:px-3" onClick={() => setOpen(false)}>
            Calculator
          </PillLink>
          <PillLink href="/apply" size="sm" className="max-sm:px-3" onClick={() => setOpen(false)}>
            Apply now
          </PillLink>
          <button
            type="button"
            className="inline-flex h-10 w-10 appearance-none items-center justify-center rounded-full bg-white text-ink-900 hover:bg-ink-100"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="site-menu"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-6 w-6" aria-hidden="true" /> : <Menu className="h-6 w-6" aria-hidden="true" />}
          </button>
        </div>
      </Container>

      <AnimatePresence>
        {open && (
          <motion.nav
            id="site-menu"
            aria-label="Site"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-x-0 top-16 border-b border-ink-100 bg-white shadow-xl"
          >
            <Container className="py-3">
              <ul className="divide-y divide-ink-100">
                {NAV_LINKS.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="block py-3.5 text-lg font-semibold text-ink-900 hover:text-brand-700"
                      onClick={() => setOpen(false)}
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="flex items-center gap-2 border-t border-ink-100 py-4 text-ink-600">
                <Phone className="h-4 w-4" aria-hidden="true" />
                {CONTACT.phoneHref ? (
                  <a href={`tel:${CONTACT.phoneHref}`} className="font-semibold text-ink-900">
                    {CONTACT.phoneDisplay}
                  </a>
                ) : (
                  <span>{CONTACT.phoneDisplay}</span>
                )}
                <VerifyTag k="contact" />
              </p>
            </Container>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
