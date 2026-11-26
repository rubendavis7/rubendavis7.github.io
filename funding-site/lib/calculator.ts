/**
 * FUNDING CALCULATOR MATH
 * =============================================================================
 * Everything the calculator shows comes from the constants in this file.
 * Change a number here and the homepage calculator, /calculator, the
 * thank-you screen and the API estimate all follow.
 *
 * !! EVERY NUMBER MARKED [VERIFY] IS A PLACEHOLDER. !!
 * They are NOT Delta Capital Group's real underwriting numbers. Replace them
 * with numbers you have confirmed, then set VERIFIED.calculator = true in
 * lib/site-config.ts to remove the on-page [VERIFY] tags.
 *
 * How the estimate works (three steps):
 *
 *   1. monthlyRevenue  = annualSales / 12
 *   2. fundingAmount   = monthlyRevenue x tier.revenueMultiple
 *                        (never more than MAX_FUNDING_AMOUNT,
 *                         rounded down to the nearest FUNDING_ROUND_TO)
 *   3. totalPayback    = fundingAmount x tier.factorRate
 *      monthlyPayment  = totalPayback / tier.termMonths
 *      weeklyPayment   = totalPayback / (tier.termMonths x WEEKS_PER_MONTH)
 *
 * Compliance note: the working-capital product is a purchase of future
 * receivables. It has a FACTOR RATE, not an interest rate or APR, and the
 * "payment" is an estimated remittance, not a fixed loan payment. Keep the
 * wording in the UI consistent with that.
 * =============================================================================
 */

/** Slider / input limits for annual sales. */
export const MIN_ANNUAL_SALES = 10_000;
export const MAX_ANNUAL_SALES = 5_000_000;
export const DEFAULT_ANNUAL_SALES = 500_000;

/** Below this annual sales figure we show the "smaller offer, specialist review" notice. */
export const SMALL_OFFER_SALES_THRESHOLD = 300_000;

/** [VERIFY] Largest amount the calculator will ever show. */
export const MAX_FUNDING_AMOUNT = 500_000;

/** Estimates are rounded down to the nearest multiple of this. */
export const FUNDING_ROUND_TO = 100;

/** [VERIFY] The thank-you screen shows a range: estimate -/+ this share (0.2 = 20%). */
export const ESTIMATE_RANGE_SPREAD = 0.2;

const WEEKS_PER_MONTH = 52 / 12;

export type TibId = "not-open" | "3-9m" | "10-24m" | "2-5y" | "5y-plus";

export interface TibTier {
  /** Value used in URLs (?tib=...) and stored on the application. */
  id: TibId;
  /** Text on the pill button. */
  label: string;
  /** false = no estimate is shown for this tier. */
  eligible: boolean;
  /** [VERIFY] Funding amount as a multiple of ONE MONTH of revenue. */
  revenueMultiple: number;
  /** [VERIFY] Factor rate. Total payback = funding amount x factor rate. */
  factorRate: number;
  /** [VERIFY] Estimated term in months, used only to size the payment estimate. */
  termMonths: number;
}

/**
 * One row per time-in-business button, in the order they appear.
 * [VERIFY] all revenueMultiple / factorRate / termMonths values.
 */
export const TIB_TIERS: readonly TibTier[] = [
  { id: "not-open", label: "Not open yet", eligible: false, revenueMultiple: 0, factorRate: 0, termMonths: 0 },
  { id: "3-9m", label: "3 – 9 months", eligible: true, revenueMultiple: 0.5, factorRate: 1.45, termMonths: 6 },
  { id: "10-24m", label: "10 – 24 months", eligible: true, revenueMultiple: 0.75, factorRate: 1.38, termMonths: 9 },
  { id: "2-5y", label: "2 – 5 years", eligible: true, revenueMultiple: 1.0, factorRate: 1.32, termMonths: 12 },
  { id: "5y-plus", label: "5 years+", eligible: true, revenueMultiple: 1.25, factorRate: 1.28, termMonths: 15 },
];

export const DEFAULT_TIB: TibId = "2-5y";

export function isTibId(value: unknown): value is TibId {
  return typeof value === "string" && TIB_TIERS.some((t) => t.id === value);
}

export function getTier(id: TibId): TibTier {
  return TIB_TIERS.find((t) => t.id === id) ?? TIB_TIERS[0];
}

/** Lowest factor rate across eligible tiers. Used for "factor rates from ..." copy. */
export const LOWEST_FACTOR_RATE = Math.min(
  ...TIB_TIERS.filter((t) => t.eligible).map((t) => t.factorRate),
);

export type Estimate =
  | {
      status: "ok";
      fundingAmount: number;
      totalPayback: number;
      monthlyPayment: number;
      weeklyPayment: number;
      factorRate: number;
      termMonths: number;
      /** true when annual sales are under SMALL_OFFER_SALES_THRESHOLD. */
      needsSpecialistReview: boolean;
      /** true when the estimate was limited by MAX_FUNDING_AMOUNT. */
      capped: boolean;
    }
  /** "Not open yet" (or any tier marked eligible: false). */
  | { status: "ineligible" }
  /** Sales figure missing or below MIN_ANNUAL_SALES. */
  | { status: "incomplete" };

/** Keeps a sales figure inside the calculator's limits. */
export function clampSales(value: number): number {
  if (!Number.isFinite(value)) return MIN_ANNUAL_SALES;
  return Math.min(MAX_ANNUAL_SALES, Math.max(MIN_ANNUAL_SALES, Math.round(value)));
}

/**
 * The one function the UI calls.
 * Pass annualSales = null when the input is empty.
 */
export function calculateEstimate(annualSales: number | null, tibId: TibId): Estimate {
  const tier = getTier(tibId);
  if (!tier.eligible) return { status: "ineligible" };

  if (annualSales === null || !Number.isFinite(annualSales) || annualSales < MIN_ANNUAL_SALES) {
    return { status: "incomplete" };
  }

  const sales = Math.min(annualSales, MAX_ANNUAL_SALES);
  const monthlyRevenue = sales / 12;

  const uncapped = monthlyRevenue * tier.revenueMultiple;
  const capped = uncapped > MAX_FUNDING_AMOUNT;
  const limited = Math.min(uncapped, MAX_FUNDING_AMOUNT);
  // The tiny epsilon stops floating-point noise from rounding 2,500 down to 2,400.
  const fundingAmount = Math.floor(limited / FUNDING_ROUND_TO + 1e-9) * FUNDING_ROUND_TO;

  const totalPayback = fundingAmount * tier.factorRate;
  const monthlyPayment = totalPayback / tier.termMonths;
  const weeklyPayment = totalPayback / (tier.termMonths * WEEKS_PER_MONTH);

  return {
    status: "ok",
    fundingAmount,
    totalPayback: Math.round(totalPayback),
    monthlyPayment: Math.round(monthlyPayment),
    weeklyPayment: Math.round(weeklyPayment),
    factorRate: tier.factorRate,
    termMonths: tier.termMonths,
    needsSpecialistReview: sales < SMALL_OFFER_SALES_THRESHOLD,
    capped,
  };
}

/** Low/high range around an estimate, for the thank-you screen. null when there is no estimate. */
export function estimateRange(estimate: Estimate): { low: number; high: number } | null {
  if (estimate.status !== "ok" || estimate.fundingAmount <= 0) return null;
  const round = (n: number) => Math.round(n / FUNDING_ROUND_TO) * FUNDING_ROUND_TO;
  return {
    low: round(estimate.fundingAmount * (1 - ESTIMATE_RANGE_SPREAD)),
    high: Math.min(MAX_FUNDING_AMOUNT, round(estimate.fundingAmount * (1 + ESTIMATE_RANGE_SPREAD))),
  };
}

/* -----------------------------------------------------------------------------
 * Slider mapping
 * The slider runs 0..SLIDER_STEPS on a log scale so the low end ($10K-$300K)
 * gets as much travel as the high end. These two functions convert between a
 * slider position and a dollar figure.
 * -------------------------------------------------------------------------- */

export const SLIDER_STEPS = 1000;
const LOG_RATIO = Math.log(MAX_ANNUAL_SALES / MIN_ANNUAL_SALES);

/** Slider snaps to friendly numbers: $1K steps under $100K, $5K under $1M, $25K above. */
function snap(value: number): number {
  const step = value < 100_000 ? 1_000 : value < 1_000_000 ? 5_000 : 25_000;
  return Math.round(value / step) * step;
}

export function sliderToSales(position: number): number {
  const p = Math.min(SLIDER_STEPS, Math.max(0, position));
  if (p === 0) return MIN_ANNUAL_SALES;
  if (p === SLIDER_STEPS) return MAX_ANNUAL_SALES;
  return clampSales(snap(MIN_ANNUAL_SALES * Math.exp((LOG_RATIO * p) / SLIDER_STEPS)));
}

export function salesToSlider(sales: number | null): number {
  if (sales === null) return 0;
  const s = clampSales(sales);
  return Math.round((Math.log(s / MIN_ANNUAL_SALES) / LOG_RATIO) * SLIDER_STEPS);
}
