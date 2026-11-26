import { describe, expect, it } from "vitest";
import {
  EMPTY_DRAFT,
  coerceDraft,
  firstStepWithError,
  normalizePhone,
  validateApplication,
  validateFeedback,
  validateStep,
  type ApplicationDraft,
} from "./validation";

const good: ApplicationDraft = {
  businessName: "  Test Bakery LLC ",
  industry: "Retail",
  timeInBusiness: "2-5y",
  annualSales: 450_000,
  requestedAmount: 40_000,
  useOfFunds: "Inventory",
  fullName: "Test Person",
  email: " Owner@Example.com ",
  phone: "(555) 234-5678",
  consent: true,
};

describe("validateApplication", () => {
  it("accepts and cleans a good draft", () => {
    const r = validateApplication(good);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.businessName).toBe("Test Bakery LLC");
    expect(r.data.email).toBe("owner@example.com");
    expect(r.data.phone).toBe("5552345678");
  });

  it("rejects an empty draft on every field", () => {
    const r = validateApplication(EMPTY_DRAFT);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(Object.keys(EMPTY_DRAFT).sort());
  });

  it("requires consent", () => {
    const r = validateApplication({ ...good, consent: false });
    expect(!r.ok && r.errors.consent).toBeTruthy();
  });

  it("enforces requested amount limits", () => {
    expect(validateApplication({ ...good, requestedAmount: 999 }).ok).toBe(false);
    expect(validateApplication({ ...good, requestedAmount: 1_000 }).ok).toBe(true);
    expect(validateApplication({ ...good, requestedAmount: 5_000_001 }).ok).toBe(false);
  });

  it("rejects bad emails and phones", () => {
    expect(validateApplication({ ...good, email: "nope" }).ok).toBe(false);
    expect(validateApplication({ ...good, phone: "12345" }).ok).toBe(false);
    expect(normalizePhone("+1 (555) 234-5678")).toBe("5552345678");
    expect(normalizePhone("055-234-5678")).toBe("");
  });

  it("accepts a not-open-yet business with zero sales", () => {
    expect(validateApplication({ ...good, timeInBusiness: "not-open", annualSales: 0 }).ok).toBe(true);
  });
});

describe("steps", () => {
  it("only checks the fields on the current step", () => {
    expect(Object.keys(validateStep(EMPTY_DRAFT, 0))).toEqual(["businessName", "industry", "timeInBusiness"]);
    expect(validateStep(good, 2)).toEqual({});
  });
  it("finds the first step with an error", () => {
    expect(firstStepWithError({ email: "x" })).toBe(2);
    expect(firstStepWithError({ email: "x", annualSales: "y" })).toBe(1);
    expect(firstStepWithError({})).toBe(-1);
  });
});

describe("coerceDraft", () => {
  it("survives junk input", () => {
    for (const junk of [null, undefined, 42, "str", [], { annualSales: "abc", consent: "true", timeInBusiness: 7 }]) {
      const d = coerceDraft(junk);
      expect(d.annualSales).toBeNull();
      expect(d.consent).toBe(false);
      expect(d.timeInBusiness).toBe("");
    }
  });
  it("accepts numeric strings", () => {
    expect(coerceDraft({ annualSales: "300000" }).annualSales).toBe(300_000);
  });
});

describe("validateFeedback", () => {
  it("accepts 1-5 with an optional comment", () => {
    expect(validateFeedback({ applicationId: "DCG-ABCD2345", rating: 5 }).ok).toBe(true);
    expect(validateFeedback({ applicationId: "DCG-ABCD2345", rating: 1, comment: " ok " })).toEqual({
      ok: true,
      data: { applicationId: "DCG-ABCD2345", rating: 1, comment: "ok" },
    });
  });
  it("rejects bad ratings, ids and comments", () => {
    for (const rating of [0, 6, 2.5, "5", null, undefined]) {
      expect(validateFeedback({ applicationId: "DCG-ABCD2345", rating }).ok).toBe(false);
    }
    expect(validateFeedback({ applicationId: "", rating: 3 }).ok).toBe(false);
    expect(validateFeedback({ applicationId: "DCG-ABCD2345", rating: 3, comment: "x".repeat(1001) }).ok).toBe(false);
    expect(validateFeedback(null).ok).toBe(false);
  });
});
