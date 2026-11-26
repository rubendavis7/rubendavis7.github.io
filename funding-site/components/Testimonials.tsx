"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Quote } from "lucide-react";
import { useState } from "react";
import { TESTIMONIALS } from "@/lib/site-config";
import { Container, SectionHeading, VerifyTag } from "./ui";

export function Testimonials() {
  const [index, setIndex] = useState(0);
  const count = TESTIMONIALS.length;
  const t = TESTIMONIALS[index];
  const go = (step: number) => setIndex((i) => (i + step + count) % count);

  const arrow =
    "inline-flex h-12 w-12 items-center justify-center rounded-full border-2 border-ink-200 bg-white text-ink-900 transition-colors hover:border-ink-950";

  return (
    <section className="bg-ink-50 py-16 sm:py-24" aria-roledescription="carousel" aria-label="Client testimonials">
      <Container>
        <div className="flex items-end justify-between gap-4">
          <SectionHeading eyebrow="From owners" title="What clients say." />
          <div className="hidden gap-2 sm:flex">
            <button type="button" className={arrow} aria-label="Previous testimonial" onClick={() => go(-1)}>
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button type="button" className={arrow} aria-label="Next testimonial" onClick={() => go(1)}>
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="mt-8 rounded-3xl bg-white p-7 sm:p-12" aria-live="polite">
          <Quote className="h-9 w-9 text-brand-600" aria-hidden="true" />
          <AnimatePresence mode="wait" initial={false}>
            <motion.figure
              key={index}
              data-testid="testimonial"
              data-index={index}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }}
              className="mt-5 min-h-[190px] sm:min-h-[150px]"
            >
              <blockquote className="text-xl font-semibold leading-snug text-ink-950 sm:text-2xl">{t.quote}</blockquote>
              <figcaption className="mt-5 text-ink-600">
                <span className="font-bold text-ink-950">{t.name}</span> · {t.detail}{" "}
                <VerifyTag k="testimonials" className="ml-1" />
              </figcaption>
            </motion.figure>
          </AnimatePresence>

          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm font-semibold text-ink-500">
              {index + 1} / {count}
            </p>
            <div className="flex gap-2 sm:hidden">
              <button type="button" className={arrow} aria-label="Previous testimonial" onClick={() => go(-1)}>
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              <button type="button" className={arrow} aria-label="Next testimonial" onClick={() => go(1)}>
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
