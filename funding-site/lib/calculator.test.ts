import { describe, expect, it } from "vitest";
import {
  MAX_ANNUAL_SALES,
  MAX_FUNDING_AMOUNT,
  MIN_ANNUAL_SALES,
  SLIDER_STEPS,
  TIB_TIERS,
  calculateEstimate,
  clampSales,
  estimateRange,
  isTibId,
  salesToSlider,
  sliderToSales,
} from "./calculator";
import { formatPhone, formatUSD, parseDollars } from "./format";

describe("calculateEstimate boundaries", () => {
  it("returns ineligible for 'Not open yet' at any sales figure", () => {
    for (const sales of [null, 0, 10_000, 300_000, 5_000_000]) {
      expect(calculateEstimate(sales, "not-open")).toEqual({ status: "ineligible" });
    }
  });

  it("returns incomplete when the input is cleared or below the minimum", () => {
    expect(calculateEstimate(null, "2-5y").status).toBe("incomplete");
    expect(calculateEstimate(0, "2-5y").status).toBe("incomplete");
    expect(calculateEstimate(9_999, "2-5y").status).toBe("incomplete");
    expect(calculateEstimate(Number.NaN, "2-5y").status).toBe("incomplete");
  });

  it("gives an estimate at the $10,000 minimum and flags specialist review", () => {
    const e = calculateEstimate(10_000, "2-5y");
    expect(e.status).toBe("ok");
    if (e.status !== "ok") return;
    expect(e.fundingAmount).toBe(800); // 833.33 x 1.0, rounded down to $100
    expect(e.needsSpecialistReview).toBe(true);
    expect(e.monthlyPayment).toBeGreaterThan(0);
  });

  it("flags $299,999 for review but not $300,000", () => {
    const below = calculateEstimate(299_999, "2-5y");
    const at = calculateEstimate(300_000, "2-5y");
    expect(below.status === "ok" && below.needsSpecialistReview).toBe(true);
    expect(at.status === "ok" && at.needsSpecialistReview).toBe(false);
    expect(at.status === "ok" && at.fundingAmount).toBe(25_000);
  });

  it("applies the factor rate and term at $300,000 / 2-5 years", () => {
    const e = calculateEstimate(300_000, "2-5y");
    if (e.status !== "ok") throw new Error("expected ok");
    expect(e.totalPayback).toBe(33_000); // 25,000 x 1.32
    expect(e.monthlyPayment).toBe(2_750); // 33,000 / 12
    expect(e.weeklyPayment).toBe(635); // 33,000 / 52
  });

  it("caps at the maximum funding amount at $5,000,000", () => {
    const e = calculateEstimate(5_000_000, "5y-plus");
    if (e.status !== "ok") throw new Error("expected ok");
    expect(e.fundingAmount).toBe(MAX_FUNDING_AMOUNT);
    expect(e.capped).toBe(true);
    expect(e.needsSpecialistReview).toBe(false);
  });

  it("treats anything above $5,000,000 the same as $5,000,000", () => {
    expect(calculateEstimate(9_000_000, "2-5y")).toEqual(calculateEstimate(5_000_000, "2-5y"));
  });

  it("never returns a negative or non-finite number for any tier", () => {
    for (const tier of TIB_TIERS.filter((t) => t.eligible)) {
      for (const sales of [10_000, 299_999, 300_000, 1_234_567, 5_000_000]) {
        const e = calculateEstimate(sales, tier.id);
        if (e.status !== "ok") throw new Error("expected ok");
        for (const n of [e.fundingAmount, e.totalPayback, e.monthlyPayment, e.weeklyPayment]) {
          expect(Number.isFinite(n) && n >= 0).toBe(true);
        }
      }
    }
  });
});

describe("estimateRange", () => {
  it("is null without an estimate", () => {
    expect(estimateRange({ status: "ineligible" })).toBeNull();
    expect(estimateRange({ status: "incomplete" })).toBeNull();
  });
  it("brackets the estimate and respects the cap", () => {
    expect(estimateRange(calculateEstimate(300_000, "2-5y"))).toEqual({ low: 20_000, high: 30_000 });
    expect(estimateRange(calculateEstimate(5_000_000, "5y-plus"))?.high).toBe(MAX_FUNDING_AMOUNT);
  });
});

describe("slider mapping", () => {
  it("hits both ends exactly", () => {
    expect(sliderToSales(0)).toBe(MIN_ANNUAL_SALES);
    expect(sliderToSales(SLIDER_STEPS)).toBe(MAX_ANNUAL_SALES);
    expect(salesToSlider(MIN_ANNUAL_SALES)).toBe(0);
    expect(salesToSlider(MAX_ANNUAL_SALES)).toBe(SLIDER_STEPS);
    expect(salesToSlider(null)).toBe(0);
  });
  it("is monotonic and stays in range", () => {
    let last = 0;
    for (let p = 0; p <= SLIDER_STEPS; p++) {
      const v = sliderToSales(p);
      expect(v).toBeGreaterThanOrEqual(last);
      expect(v).toBeGreaterThanOrEqual(MIN_ANNUAL_SALES);
      expect(v).toBeLessThanOrEqual(MAX_ANNUAL_SALES);
      last = v;
    }
  });
  it("clamps out-of-range values", () => {
    expect(clampSales(5)).toBe(MIN_ANNUAL_SALES);
    expect(clampSales(99_000_000)).toBe(MAX_ANNUAL_SALES);
    expect(clampSales(Number.NaN)).toBe(MIN_ANNUAL_SALES);
  });
});

describe("helpers", () => {
  it("validates tib ids", () => {
    expect(isTibId("5y-plus")).toBe(true);
    expect(isTibId("forever")).toBe(false);
    expect(isTibId(undefined)).toBe(false);
  });
  it("parses and formats dollars", () => {
    expect(parseDollars("$1,250,000")).toBe(1_250_000);
    expect(parseDollars("")).toBeNull();
    expect(parseDollars("abc")).toBeNull();
    expect(parseDollars("300000.75")).toBe(300_000);
    expect(formatUSD(299_999)).toBe("$299,999");
  });
  it("formats phones", () => {
    expect(formatPhone("5551234567")).toBe("(555) 123-4567");
    expect(formatPhone("+1 555 123 4567")).toBe("(555) 123-4567");
    expect(formatPhone("555")).toBe("555");
  });
});
