"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Landmark, RefreshCw, Wallet } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import { PRODUCTS, type ProductId } from "@/lib/site-config";
import { PhotoSlot } from "./PhotoSlot";
import { Container, PillLink, SectionHeading, VerifyTag } from "./ui";

const icons: Record<ProductId, typeof Wallet> = {
  "working-capital": Wallet,
  "term-loan": Landmark,
  "line-of-credit": RefreshCw,
};

export function ProductTabs() {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const product = PRODUCTS[active];
  const Icon = icons[product.id];

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const move = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!move) return;
    e.preventDefault();
    const next = (active + move + PRODUCTS.length) % PRODUCTS.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <section id="products" className="py-16 sm:py-24">
      <Container>
        <SectionHeading eyebrow="Products" title="Three ways to fund. One conversation.">
          Not sure which one fits? Apply once and your specialist will walk you through the options.
        </SectionHeading>

        <div
          role="tablist"
          aria-label="Funding products"
          onKeyDown={onKeyDown}
          className="mt-8 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {PRODUCTS.map((p, i) => (
            <button
              key={p.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${p.id}`}
              aria-selected={i === active}
              aria-controls="product-panel"
              tabIndex={i === active ? 0 : -1}
              onClick={() => setActive(i)}
              className="pill-option h-11 shrink-0 rounded-full px-5 text-sm whitespace-nowrap"
            >
              {p.tab}
            </button>
          ))}
        </div>

        <div id="product-panel" role="tabpanel" aria-labelledby={`tab-${product.id}`} className="mt-6">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.22 }}
              className="grid gap-6 lg:grid-cols-2 lg:gap-10"
            >
              {/* Feature image card. Pass src to PhotoSlot to use a real photo. */}
              <PhotoSlot tone={active % 2 === 0 ? "brand" : "dark"} className="min-h-[260px] rounded-3xl sm:min-h-[360px]">
                <span className="absolute left-6 top-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-white backdrop-blur">
                  <Icon className="h-7 w-7" aria-hidden="true" />
                </span>
                <div className="absolute bottom-6 left-6 rounded-2xl bg-white px-5 py-4 shadow-xl">
                  <p className="text-xs font-semibold text-ink-600">
                    {product.exampleLabel} <VerifyTag k="products" className="ml-1" />
                  </p>
                  <p className="text-3xl font-extrabold tabular-nums tracking-tight text-ink-950">{product.exampleAmount}</p>
                </div>
              </PhotoSlot>

              <div className="flex flex-col justify-center">
                <h3 className="text-2xl font-extrabold tracking-tight text-ink-950 sm:text-3xl">{product.headline}</h3>
                <p className="mt-3 text-lg text-ink-600">{product.description}</p>
                <ul className="mt-5 space-y-2.5">
                  {product.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-3 text-ink-800">
                      <Check className="mt-1 h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" /> {b}
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-sm text-ink-500">{product.finePrint}</p>
                <div className="mt-6">
                  <PillLink href="/apply">Apply now</PillLink>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </Container>
    </section>
  );
}
