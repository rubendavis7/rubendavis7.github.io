"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BadgeCheck, Check, Clock, Landmark, RefreshCw, Wallet } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { LOWEST_FACTOR_RATE } from "@/lib/calculator";
import { PRODUCTS, TIMING } from "@/lib/site-config";
import { VerifyTag, cx } from "./ui";

const AUTO_ADVANCE_MS = 4500;
const SWIPE_PX = 40;

const productIcons = [Wallet, Landmark, RefreshCw];

function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col px-4 pb-4 pt-9">
      <p className="text-[11px] font-bold uppercase tracking-widest text-brand-700">{title}</p>
      <div className="mt-3 flex flex-1 flex-col">{children}</div>
    </div>
  );
}

const slides: { label: string; render: () => ReactNode }[] = [
  {
    label: "Product selector",
    render: () => (
      <Screen title="Pick a product">
        <p className="text-lg font-extrabold leading-tight text-ink-950">What fits your business?</p>
        <ul className="mt-4 space-y-2.5">
          {PRODUCTS.map((p, i) => {
            const Icon = productIcons[i] ?? Wallet;
            return (
              <li
                key={p.id}
                className={cx(
                  "flex items-center gap-3 rounded-2xl border-2 p-3",
                  i === 0 ? "border-brand-600 bg-brand-50" : "border-ink-100 bg-white",
                )}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink-950 text-white">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="flex-1 text-sm font-bold text-ink-950">{p.tab}</span>
                <span
                  className={cx(
                    "flex h-5 w-5 items-center justify-center rounded-full border-2",
                    i === 0 ? "border-brand-700 bg-brand-700 text-white" : "border-ink-200",
                  )}
                >
                  {i === 0 && <Check className="h-3 w-3" aria-hidden="true" />}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="mt-auto rounded-full bg-ink-950 py-3 text-center text-sm font-bold text-white">Continue</div>
      </Screen>
    ),
  },
  {
    label: "Starting rates",
    render: () => (
      <Screen title="Starting rates">
        <p className="text-lg font-extrabold leading-tight text-ink-950">See the cost before you sign.</p>
        <div className="mt-4 rounded-2xl bg-ink-950 p-4 text-white">
          <p className="text-xs text-ink-300">Factor rates from</p>
          <p className="mt-1 text-4xl font-extrabold tabular-nums">{LOWEST_FACTOR_RATE.toFixed(2)}</p>
          <VerifyTag k="calculator" className="mt-2" />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-600">
          Example for working capital. Your rate is set in underwriting. A factor rate is not an interest rate or APR.
        </p>
        <div className="mt-auto grid grid-cols-2 gap-2 text-center text-[11px] font-semibold text-ink-700">
          <span className="rounded-xl bg-ink-100 py-2">Amount</span>
          <span className="rounded-xl bg-ink-100 py-2">Total payback</span>
        </div>
      </Screen>
    ),
  },
  {
    label: `${TIMING.decision} decision`,
    render: () => (
      <Screen title="Decision">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-100 text-brand-800">
            <Clock className="h-10 w-10" aria-hidden="true" />
          </span>
          <p className="mt-5 text-2xl font-extrabold leading-tight text-ink-950">
            A decision in as little as {TIMING.decision}
          </p>
          <VerifyTag k="timing" className="mt-2" />
          <p className="mt-3 text-xs leading-relaxed text-ink-600">
            Once your file is complete. Timing depends on underwriting and isn&apos;t a promise of approval.
          </p>
        </div>
      </Screen>
    ),
  },
  {
    label: "Funding confirmation",
    render: () => (
      <Screen title="Confirmation">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-700 text-white">
            <BadgeCheck className="h-10 w-10" aria-hidden="true" />
          </span>
          <p className="mt-5 text-sm font-semibold text-ink-600">Funds on the way</p>
          <p className="text-4xl font-extrabold tabular-nums text-ink-950">{PRODUCTS[0].exampleAmount}</p>
          <VerifyTag k="products" className="mt-2" />
          <p className="mt-3 text-xs leading-relaxed text-ink-600">
            Example screen only. Not a client result or an offer.
          </p>
        </div>
      </Screen>
    ),
  },
];

/** Phone mockup that cycles through four preview screens. Dots, swipe and pause-on-hover. */
export function PhoneCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (paused || reduceMotion) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % slides.length), AUTO_ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [paused, reduceMotion]);

  const go = (step: number) => setIndex((i) => (i + step + slides.length) % slides.length);

  return (
    <div
      className="flex flex-col items-center"
      role="group"
      aria-roledescription="carousel"
      aria-label="App preview"
      // Pause for a mouse hover or keyboard focus only. On touchscreens a tap
      // would otherwise leave the carousel "hovered" and paused for good.
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") setPaused(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") setPaused(false);
      }}
      onFocus={(e) => {
        if (e.target.matches(":focus-visible")) setPaused(true);
      }}
      onBlur={() => setPaused(false)}
    >
      <div className="relative h-[480px] w-[244px] rounded-[2.75rem] bg-ink-950 p-2.5 shadow-2xl ring-1 ring-white/15">
        <div className="absolute left-1/2 top-4 z-10 h-5 w-20 -translate-x-1/2 rounded-full bg-ink-950" aria-hidden="true" />
        <div className="h-full w-full overflow-hidden rounded-[2.2rem] bg-white">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={index}
              data-testid="phone-slide"
              data-slide={index}
              className="h-full cursor-grab touch-pan-y active:cursor-grabbing"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.25 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.25}
              onDragStart={() => setPaused(true)}
              onDragEnd={(_, info) => {
                if (info.offset.x <= -SWIPE_PX) go(1);
                else if (info.offset.x >= SWIPE_PX) go(-1);
                setPaused(false);
              }}
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${slides.length}: ${slides[index].label}`}
            >
              {slides[index].render()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-1">
        {slides.map((s, i) => (
          <button
            key={s.label}
            type="button"
            data-testid="phone-dot"
            aria-label={`Show slide ${i + 1}: ${s.label}`}
            aria-current={i === index}
            onClick={() => setIndex(i)}
            className="flex h-8 w-8 appearance-none items-center justify-center [-webkit-tap-highlight-color:transparent]"
          >
            <span className={cx("h-2.5 rounded-full transition-all", i === index ? "w-7 bg-brand-400" : "w-2.5 bg-white/35")} />
          </button>
        ))}
      </div>
    </div>
  );
}
