"use client";

import { ArrowRight, CircleAlert, Info } from "lucide-react";
import Link from "next/link";
import { useId, useState, type CSSProperties } from "react";
import {
  DEFAULT_ANNUAL_SALES,
  DEFAULT_TIB,
  MAX_ANNUAL_SALES,
  MIN_ANNUAL_SALES,
  SLIDER_STEPS,
  SMALL_OFFER_SALES_THRESHOLD,
  calculateEstimate,
  salesToSlider,
  sliderToSales,
  type TibId,
} from "@/lib/calculator";
import { formatUSD } from "@/lib/format";
import { QUALIFICATION } from "@/lib/site-config";
import { MoneyInput } from "./MoneyInput";
import { TibPills } from "./TibPills";
import { VerifyTag, pillClass } from "./ui";

/** Shown in an output card when there is nothing to estimate. */
const NO_VALUE = "-";

export function Calculator() {
  const uid = useId();
  const [tib, setTib] = useState<TibId>(DEFAULT_TIB);
  // null = the input is empty. The slider and the input both read and write this one value.
  const [sales, setSales] = useState<number | null>(DEFAULT_ANNUAL_SALES);

  const estimate = calculateEstimate(sales, tib);
  const sliderPos = salesToSlider(sales);
  const ok = estimate.status === "ok";

  const applyHref = `/apply?${new URLSearchParams({
    ...(sales !== null ? { sales: String(Math.min(MAX_ANNUAL_SALES, Math.max(0, sales))) } : {}),
    tib,
  }).toString()}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr] lg:gap-8">
      {/* Inputs */}
      <div className="rounded-3xl bg-ink-50 p-5 sm:p-8">
        <p id={`${uid}-tib`} className="text-sm font-bold uppercase tracking-widest text-ink-600">
          Time in business
        </p>
        <div className="mt-3">
          <TibPills value={tib} onChange={setTib} labelledBy={`${uid}-tib`} />
        </div>

        <label htmlFor={`${uid}-sales`} className="mt-8 block text-sm font-bold uppercase tracking-widest text-ink-600">
          Annual sales
        </label>
        <MoneyInput
          id={`${uid}-sales`}
          data-testid="sales-input"
          className="mt-3"
          size="xl"
          value={sales}
          max={MAX_ANNUAL_SALES}
          suffix={sales !== null && sales >= MAX_ANNUAL_SALES ? "+" : undefined}
          placeholder="0"
          aria-describedby={`${uid}-sales-hint`}
          onValueChange={setSales}
          onBlur={() => {
            if (sales !== null && sales < MIN_ANNUAL_SALES) setSales(MIN_ANNUAL_SALES);
          }}
        />

        <input
          type="range"
          className="sales-slider mt-3"
          data-testid="sales-slider"
          min={0}
          max={SLIDER_STEPS}
          step={1}
          value={sliderPos}
          aria-label="Annual sales"
          aria-valuetext={sales === null ? "Not set" : `${formatUSD(sales)}${sales >= MAX_ANNUAL_SALES ? " or more" : ""}`}
          style={{ "--fill": `${(sliderPos / SLIDER_STEPS) * 100}%` } as CSSProperties}
          onChange={(e) => setSales(sliderToSales(Number(e.target.value)))}
        />
        <div className="flex justify-between text-xs font-semibold text-ink-500" aria-hidden="true">
          <span>{formatUSD(MIN_ANNUAL_SALES)}</span>
          <span>{formatUSD(MAX_ANNUAL_SALES)}+</span>
        </div>
        <p id={`${uid}-sales-hint`} className="mt-2 text-sm text-ink-500">
          {estimate.status === "incomplete"
            ? `Enter annual sales of at least ${formatUSD(MIN_ANNUAL_SALES)} to see an estimate.`
            : "Type a number or drag the slider. A rough figure is fine."}
        </p>
      </div>

      {/* Outputs */}
      <div className="flex flex-col gap-4">
        <div aria-live="polite" className="flex flex-col gap-4">
          <div className="rounded-3xl bg-ink-950 p-6 text-white sm:p-7">
            <p className="text-sm font-semibold text-ink-300">
              Estimated funding amount <VerifyTag k="calculator" className="ml-1" />
            </p>
            <p data-testid="out-funding" className="mt-2 text-4xl font-extrabold tracking-tight tabular-nums sm:text-5xl">
              {ok ? formatUSD(estimate.fundingAmount) : NO_VALUE}
            </p>
            {ok && (
              <p className="mt-2 text-sm text-ink-300">
                {estimate.capped ? "Calculator maximum. Larger amounts are reviewed case by case. " : ""}
                Example factor rate {estimate.factorRate.toFixed(2)}.
              </p>
            )}
          </div>

          <div className="rounded-3xl border-2 border-ink-100 bg-white p-6 sm:p-7">
            <p className="text-sm font-semibold text-ink-600">
              Estimated payment <VerifyTag k="calculator" className="ml-1" />
            </p>
            <p data-testid="out-payment" className="mt-2 text-4xl font-extrabold tracking-tight tabular-nums text-ink-950 sm:text-5xl">
              {ok ? formatUSD(estimate.monthlyPayment) : NO_VALUE}
              {ok && <span className="ml-1 text-lg font-semibold text-ink-500">/ month</span>}
            </p>
            {ok && (
              <p className="mt-2 text-sm text-ink-600">
                About {formatUSD(estimate.weeklyPayment)} a week. Remitted daily or weekly from your sales, so the
                actual amount moves with your revenue.
              </p>
            )}
          </div>

          {estimate.status === "ineligible" && (
            <div role="alert" data-testid="alert-not-open" className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <p>
                <strong>We fund businesses that are already open.</strong> Our minimum is {QUALIFICATION[1].value} in
                business with revenue coming in. <VerifyTag k="qualification" /> Not there yet? Apply anyway and a
                specialist will tell you what to line up first.
              </p>
            </div>
          )}

          {ok && estimate.needsSpecialistReview && (
            <div data-testid="notice-small-offer" className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <p>
                <strong>Under {formatUSD(SMALL_OFFER_SALES_THRESHOLD)} in annual sales, offers may be smaller.</strong>{" "}
                Have a specialist review your numbers before you count on this estimate.
              </p>
            </div>
          )}
        </div>

        <Link href={applyHref} data-testid="calc-cta" className={pillClass("primary", "lg", "w-full")}>
          Get Funded Today! <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </Link>
        <p className="text-xs leading-relaxed text-ink-500">
          Estimate only. Not an offer or an approval. The amount, factor rate and payment are set in underwriting
          after we review a complete application.
        </p>
      </div>
    </div>
  );
}
