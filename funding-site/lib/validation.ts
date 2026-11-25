/**
 * Application validation. The same functions run in the browser (inline
 * errors, step by step) and on the server (POST /api/apply), so the rules
 * can't drift apart.
 */
import { isTibId, type TibId } from "./calculator";
import { INDUSTRIES, REQUEST_LIMITS, USES_OF_FUNDS } from "./site-config";
import { formatUSD } from "./format";

/** What the form holds while the user types. Money fields are whole dollars or null. */
export interface ApplicationDraft {
  businessName: string;
  industry: string;
  timeInBusiness: TibId | "";
  annualSales: number | null;
  requestedAmount: number | null;
  useOfFunds: string;
  fullName: string;
  email: string;
  phone: string;
  consent: boolean;
}

/** A draft that passed validation. */
export interface ApplicationData {
  businessName: string;
  industry: string;
  timeInBusiness: TibId;
  annualSales: number;
  requestedAmount: number;
  useOfFunds: string;
  fullName: string;
  email: string;
  /** 10 digits, no formatting. */
  phone: string;
  consent: true;
}

export type FieldName = keyof ApplicationDraft;
export type FieldErrors = Partial<Record<FieldName, string>>;

/** Which fields belong to which step of the funnel. */
export const STEP_FIELDS: readonly (readonly FieldName[])[] = [
  ["businessName", "industry", "timeInBusiness"],
  ["annualSales", "requestedAmount", "useOfFunds"],
  ["fullName", "email", "phone", "consent"],
];

export const EMPTY_DRAFT: ApplicationDraft = {
  businessName: "",
  industry: "",
  timeInBusiness: "",
  annualSales: null,
  requestedAmount: null,
  useOfFunds: "",
  fullName: "",
  email: "",
  phone: "",
  consent: false,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_ANNUAL_SALES_ACCEPTED = 1_000_000_000;

/** "(555) 123-4567" / "+1 555..." -> "5551234567". Returns "" when it isn't a US 10-digit number. */
export function normalizePhone(input: string): string {
  let d = input.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length !== 10) return "";
  // US area codes and exchanges never start with 0 or 1.
  if (/^[01]/.test(d) || /^[01]/.test(d.slice(3))) return "";
  return d;
}

const checks: { [K in FieldName]: (d: ApplicationDraft) => string | undefined } = {
  businessName: (d) => {
    const v = d.businessName.trim();
    if (!v) return "Enter your business name.";
    if (v.length < 2) return "That looks too short.";
    if (v.length > 120) return "Keep it under 120 characters.";
  },
  industry: (d) => {
    if (!d.industry) return "Pick an industry.";
    if (!(INDUSTRIES as readonly string[]).includes(d.industry)) return "Pick an industry from the list.";
  },
  timeInBusiness: (d) => {
    if (!isTibId(d.timeInBusiness)) return "Pick how long you've been open.";
  },
  annualSales: (d) => {
    const v = d.annualSales;
    if (v === null || !Number.isFinite(v)) return "Enter your annual sales. A rough number is fine.";
    if (!Number.isInteger(v) || v < 0) return "Enter a whole dollar amount.";
    if (v > MAX_ANNUAL_SALES_ACCEPTED) return "That number looks too high. Check it and try again.";
  },
  requestedAmount: (d) => {
    const v = d.requestedAmount;
    if (v === null || !Number.isFinite(v)) return "Enter how much you're looking for.";
    if (!Number.isInteger(v)) return "Enter a whole dollar amount.";
    if (v < REQUEST_LIMITS.min) return `Enter at least ${formatUSD(REQUEST_LIMITS.min)}.`;
    if (v > REQUEST_LIMITS.max) return `Enter ${formatUSD(REQUEST_LIMITS.max)} or less.`;
  },
  useOfFunds: (d) => {
    if (!d.useOfFunds) return "Pick what the funds are for.";
    if (!(USES_OF_FUNDS as readonly string[]).includes(d.useOfFunds)) return "Pick an option from the list.";
  },
  fullName: (d) => {
    const v = d.fullName.trim();
    if (!v) return "Enter your full name.";
    if (v.length < 2) return "That looks too short.";
    if (v.length > 100) return "Keep it under 100 characters.";
  },
  email: (d) => {
    const v = d.email.trim();
    if (!v) return "Enter your email.";
    if (v.length > 254 || !EMAIL_RE.test(v)) return "Enter a valid email, like name@business.com.";
  },
  phone: (d) => {
    if (!d.phone.trim()) return "Enter your phone number.";
    if (!normalizePhone(d.phone)) return "Enter a 10-digit US phone number.";
  },
  consent: (d) => {
    if (d.consent !== true) return "Check the box so we can call or text you about your request.";
  },
};

export function validateFields(draft: ApplicationDraft, fields: readonly FieldName[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const f of fields) {
    const message = checks[f](draft);
    if (message) errors[f] = message;
  }
  return errors;
}

export function validateStep(draft: ApplicationDraft, step: number): FieldErrors {
  return validateFields(draft, STEP_FIELDS[step] ?? []);
}

/** Index of the first step that has an error, or -1. */
export function firstStepWithError(errors: FieldErrors): number {
  return STEP_FIELDS.findIndex((fields) => fields.some((f) => errors[f]));
}

function toStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function toWholeNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && /^\d{1,12}$/.test(v.trim())) return Number(v.trim());
  return null;
}

/** Turns an untrusted request body into a draft. Never throws. */
export function coerceDraft(body: unknown): ApplicationDraft {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const tib = toStr(b.timeInBusiness);
  return {
    businessName: toStr(b.businessName),
    industry: toStr(b.industry),
    timeInBusiness: isTibId(tib) ? tib : "",
    annualSales: toWholeNumber(b.annualSales),
    requestedAmount: toWholeNumber(b.requestedAmount),
    useOfFunds: toStr(b.useOfFunds),
    fullName: toStr(b.fullName),
    email: toStr(b.email),
    phone: toStr(b.phone),
    consent: b.consent === true,
  };
}

export type ValidationResult =
  | { ok: true; data: ApplicationData }
  | { ok: false; errors: FieldErrors };

/** Full validation of every field. Returns cleaned, trimmed data on success. */
export function validateApplication(draft: ApplicationDraft): ValidationResult {
  const errors = validateFields(draft, STEP_FIELDS.flat());
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: {
      businessName: draft.businessName.trim(),
      industry: draft.industry,
      timeInBusiness: draft.timeInBusiness as TibId,
      annualSales: draft.annualSales as number,
      requestedAmount: draft.requestedAmount as number,
      useOfFunds: draft.useOfFunds,
      fullName: draft.fullName.trim(),
      email: draft.email.trim().toLowerCase(),
      phone: normalizePhone(draft.phone),
      consent: true,
    },
  };
}

/* ------------------------------- Feedback ------------------------------- */

export const FEEDBACK_COMMENT_MAX = 1000;

export interface FeedbackInput {
  applicationId: string;
  rating: number;
  comment: string;
}

export type FeedbackValidation =
  | { ok: true; data: FeedbackInput }
  | { ok: false; errors: Partial<Record<keyof FeedbackInput, string>> };

export function validateFeedback(body: unknown): FeedbackValidation {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const errors: Partial<Record<keyof FeedbackInput, string>> = {};

  const applicationId = toStr(b.applicationId).trim();
  if (!/^[A-Z0-9-]{6,40}$/.test(applicationId)) errors.applicationId = "Missing or invalid application ID.";

  const rating = b.rating;
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    errors.rating = "Rating must be a whole number from 1 to 5.";
  }

  let comment = "";
  if (b.comment !== undefined && b.comment !== null) {
    if (typeof b.comment !== "string") errors.comment = "Comment must be text.";
    else if (b.comment.trim().length > FEEDBACK_COMMENT_MAX) {
      errors.comment = `Keep it under ${FEEDBACK_COMMENT_MAX} characters.`;
    } else comment = b.comment.trim();
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { applicationId, rating: rating as number, comment } };
}
