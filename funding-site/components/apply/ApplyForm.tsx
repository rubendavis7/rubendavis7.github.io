"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, CircleAlert, LoaderCircle, Lock } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { calculateEstimate, type TibId } from "@/lib/calculator";
import { formatPhone, formatUSD } from "@/lib/format";
import { CONSENT, INDUSTRIES, REQUEST_LIMITS, USES_OF_FUNDS } from "@/lib/site-config";
import {
  EMPTY_DRAFT,
  STEP_FIELDS,
  firstStepWithError,
  validateApplication,
  validateStep,
  type ApplicationData,
  type ApplicationDraft,
  type FieldErrors,
  type FieldName,
} from "@/lib/validation";
import { MoneyInput } from "../MoneyInput";
import { TibPills } from "../TibPills";
import { cx, pillClass } from "../ui";
import { ThankYou } from "./ThankYou";

const STEP_TITLES = ["Business details", "Revenue & funding goal", "Contact & consent"];

const inputClass = (invalid: boolean) =>
  cx(
    "h-12 w-full rounded-2xl border-2 bg-white px-3.5 text-base text-ink-950 outline-none transition-colors placeholder:text-ink-300 focus:border-brand-600",
    invalid ? "border-red-500" : "border-ink-200",
  );

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} id={`${id}-label`} className="block text-sm font-bold text-ink-900">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-ink-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-red-700">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}
        </p>
      )}
    </div>
  );
}

interface Submitted {
  applicationId: string;
  estimate: { low: number; high: number } | null;
  data: ApplicationData;
}

export function ApplyForm({ initialTib, initialSales }: { initialTib?: TibId; initialSales?: number }) {
  const [draft, setDraft] = useState<ApplicationDraft>({
    ...EMPTY_DRAFT,
    timeInBusiness: initialTib ?? "",
    annualSales: initialSales ?? null,
  });
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<Submitted | null>(null);
  const [website, setWebsite] = useState(""); // honeypot, see /api/apply
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusOnStepChange = useRef(false);

  // After moving between steps (not on first load), bring the new step into view.
  useEffect(() => {
    if (!focusOnStepChange.current) return;
    focusOnStepChange.current = false;
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [step]);

  const set = <K extends FieldName>(field: K, value: ApplicationDraft[K]) => {
    setDraft((d) => ({ ...d, [field]: value }));
    setErrors((e) => {
      if (!e[field]) return e;
      const next = { ...e };
      delete next[field];
      return next;
    });
  };

  const goTo = (next: number) => {
    focusOnStepChange.current = true;
    setStep(next);
  };

  const focusFirstError = (errs: FieldErrors) => {
    const first = (STEP_FIELDS.flat() as FieldName[]).find((f) => errs[f]);
    if (!first) return;
    window.requestAnimationFrame(() => {
      const el = formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`);
      const target = el?.matches("input,select,textarea,button") ? el : el?.querySelector<HTMLElement>("input,select,button");
      target?.focus();
    });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setFormError("");

    // Steps 1 and 2: validate this step and move on.
    if (step < STEP_TITLES.length - 1) {
      const stepErrors = validateStep(draft, step);
      setErrors(stepErrors);
      if (Object.keys(stepErrors).length > 0) return focusFirstError(stepErrors);
      return goTo(step + 1);
    }

    // Final step: validate everything, then send.
    const result = validateApplication(draft);
    if (!result.ok) {
      setErrors(result.errors);
      const bad = firstStepWithError(result.errors);
      if (bad !== -1 && bad !== step) goTo(bad);
      else focusFirstError(result.errors);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...result.data, website }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        applicationId?: string;
        estimate?: { low: number; high: number } | null;
        error?: string;
        fieldErrors?: FieldErrors;
      } | null;

      if (res.ok && json?.ok && json.applicationId) {
        setSubmitted({ applicationId: json.applicationId, estimate: json.estimate ?? null, data: result.data });
        window.scrollTo({ top: 0 });
        return;
      }
      if (res.status === 422 && json?.fieldErrors) {
        setErrors(json.fieldErrors);
        const bad = firstStepWithError(json.fieldErrors);
        if (bad !== -1 && bad !== step) goTo(bad);
        else focusFirstError(json.fieldErrors);
      }
      setFormError(json?.error || "Something went wrong on our end. Please try again.");
    } catch {
      setFormError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) return <ThankYou {...submitted} />;

  const estimate = draft.timeInBusiness ? calculateEstimate(draft.annualSales, draft.timeInBusiness) : null;
  const describe = (id: string, field: FieldName, hasHint = false) =>
    errors[field] ? `${id}-error` : hasHint ? `${id}-hint` : undefined;

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink-950 sm:text-4xl">Apply for funding</h1>
      <p className="mt-2 mb-7 text-ink-600">Three short steps. Documents can come later.</p>
      {/* Progress */}
      <ol className="flex gap-2" aria-label="Application progress">
        {STEP_TITLES.map((title, i) => (
          <li key={title} className="flex-1" aria-current={i === step ? "step" : undefined}>
            <span className={cx("block h-1.5 rounded-full transition-colors", i <= step ? "bg-brand-600" : "bg-ink-200")} />
            <span className={cx("mt-2 block text-xs font-bold", i === step ? "text-ink-950" : "text-ink-500")}>
              <span className="sm:hidden">Step {i + 1}</span>
              <span className="hidden sm:inline">
                {i + 1}. {title}
              </span>
            </span>
          </li>
        ))}
      </ol>

      <form ref={formRef} onSubmit={onSubmit} noValidate className="mt-8 rounded-3xl border-2 border-ink-100 bg-white p-5 sm:p-8">
        <p className="text-sm font-bold uppercase tracking-widest text-brand-700">
          Step {step + 1} of {STEP_TITLES.length}
        </p>
        <h2 ref={headingRef} tabIndex={-1} className="mt-1 text-2xl font-extrabold tracking-tight text-ink-950 outline-none">
          {STEP_TITLES[step]}
        </h2>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.18 }}
            className="mt-6 space-y-5"
          >
            {step === 0 && (
              <>
                <Field id="businessName" label="Business name" error={errors.businessName}>
                  <input
                    id="businessName"
                    data-field="businessName"
                    className={inputClass(Boolean(errors.businessName))}
                    value={draft.businessName}
                    onChange={(e) => set("businessName", e.target.value)}
                    autoComplete="organization"
                    maxLength={120}
                    aria-invalid={Boolean(errors.businessName) || undefined}
                    aria-describedby={describe("businessName", "businessName")}
                  />
                </Field>
                <Field id="industry" label="Industry" error={errors.industry}>
                  <select
                    id="industry"
                    data-field="industry"
                    className={inputClass(Boolean(errors.industry))}
                    value={draft.industry}
                    onChange={(e) => set("industry", e.target.value)}
                    aria-invalid={Boolean(errors.industry) || undefined}
                    aria-describedby={describe("industry", "industry")}
                  >
                    <option value="">Select one</option>
                    {INDUSTRIES.map((i) => (
                      <option key={i} value={i}>{i}</option>
                    ))}
                  </select>
                </Field>
                <div data-field="timeInBusiness">
                  <p id="timeInBusiness-label" className="text-sm font-bold text-ink-900">Time in business</p>
                  <div className="mt-1.5">
                    <TibPills
                      value={draft.timeInBusiness}
                      onChange={(id) => set("timeInBusiness", id)}
                      labelledBy="timeInBusiness-label"
                      describedBy={errors.timeInBusiness ? "timeInBusiness-error" : undefined}
                      invalid={Boolean(errors.timeInBusiness)}
                    />
                  </div>
                  {errors.timeInBusiness && (
                    <p id="timeInBusiness-error" role="alert" className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-red-700">
                      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {errors.timeInBusiness}
                    </p>
                  )}
                  {draft.timeInBusiness === "not-open" && (
                    <p className="mt-2 rounded-xl bg-red-50 p-3 text-sm text-red-900">
                      Most funding needs a business that&apos;s open with revenue coming in. You can still apply and a
                      specialist will tell you what to line up first.
                    </p>
                  )}
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <Field id="annualSales" label="Annual sales" error={errors.annualSales} hint="A rough number is fine.">
                  <MoneyInput
                    id="annualSales"
                    data-field="annualSales"
                    value={draft.annualSales}
                    onValueChange={(v) => set("annualSales", v)}
                    invalid={Boolean(errors.annualSales)}
                    placeholder="500,000"
                    aria-describedby={describe("annualSales", "annualSales", true)}
                  />
                </Field>
                <Field
                  id="requestedAmount"
                  label="How much are you looking for?"
                  error={errors.requestedAmount}
                  hint={
                    estimate?.status === "ok"
                      ? `The calculator estimate for your sales is about ${formatUSD(estimate.fundingAmount)}. Ask for what you need.`
                      : `Between ${formatUSD(REQUEST_LIMITS.min)} and ${formatUSD(REQUEST_LIMITS.max)}.`
                  }
                >
                  <MoneyInput
                    id="requestedAmount"
                    data-field="requestedAmount"
                    value={draft.requestedAmount}
                    onValueChange={(v) => set("requestedAmount", v)}
                    invalid={Boolean(errors.requestedAmount)}
                    placeholder="50,000"
                    aria-describedby={describe("requestedAmount", "requestedAmount", true)}
                  />
                </Field>
                <Field id="useOfFunds" label="What will you use the funds for?" error={errors.useOfFunds}>
                  <select
                    id="useOfFunds"
                    data-field="useOfFunds"
                    className={inputClass(Boolean(errors.useOfFunds))}
                    value={draft.useOfFunds}
                    onChange={(e) => set("useOfFunds", e.target.value)}
                    aria-invalid={Boolean(errors.useOfFunds) || undefined}
                    aria-describedby={describe("useOfFunds", "useOfFunds")}
                  >
                    <option value="">Select one</option>
                    {USES_OF_FUNDS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </Field>
              </>
            )}

            {step === 2 && (
              <>
                <Field id="fullName" label="Full name" error={errors.fullName}>
                  <input
                    id="fullName"
                    data-field="fullName"
                    className={inputClass(Boolean(errors.fullName))}
                    value={draft.fullName}
                    onChange={(e) => set("fullName", e.target.value)}
                    autoComplete="name"
                    maxLength={100}
                    aria-invalid={Boolean(errors.fullName) || undefined}
                    aria-describedby={describe("fullName", "fullName")}
                  />
                </Field>
                <Field id="email" label="Email" error={errors.email}>
                  <input
                    id="email"
                    data-field="email"
                    type="email"
                    inputMode="email"
                    className={inputClass(Boolean(errors.email))}
                    value={draft.email}
                    onChange={(e) => set("email", e.target.value)}
                    autoComplete="email"
                    maxLength={254}
                    aria-invalid={Boolean(errors.email) || undefined}
                    aria-describedby={describe("email", "email")}
                  />
                </Field>
                <Field id="phone" label="Mobile phone" error={errors.phone}>
                  <input
                    id="phone"
                    data-field="phone"
                    type="tel"
                    inputMode="tel"
                    className={inputClass(Boolean(errors.phone))}
                    value={draft.phone}
                    onChange={(e) => set("phone", formatPhone(e.target.value))}
                    autoComplete="tel-national"
                    placeholder="(555) 555-5555"
                    aria-invalid={Boolean(errors.phone) || undefined}
                    aria-describedby={describe("phone", "phone")}
                  />
                </Field>

                <div data-field="consent" className={cx("rounded-2xl border-2 p-4", errors.consent ? "border-red-500 bg-red-50" : "border-ink-100 bg-ink-50")}>
                  <label htmlFor="consent" className="flex cursor-pointer items-start gap-3">
                    <input
                      id="consent"
                      type="checkbox"
                      className="mt-0.5 h-5 w-5 shrink-0 accent-brand-700"
                      checked={draft.consent}
                      onChange={(e) => set("consent", e.target.checked)}
                      aria-invalid={Boolean(errors.consent) || undefined}
                      aria-describedby={errors.consent ? "consent-error" : undefined}
                      required
                    />
                    <span className="text-xs leading-relaxed text-ink-700">{CONSENT.text}</span>
                  </label>
                  {errors.consent && (
                    <p id="consent-error" role="alert" className="mt-2 flex items-start gap-1.5 text-sm font-medium text-red-700">
                      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {errors.consent}
                    </p>
                  )}
                </div>

                {/* Honeypot. Hidden from people and screen readers; bots tend to fill it. */}
                <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                  <label>
                    Website
                    <input tabIndex={-1} autoComplete="off" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} />
                  </label>
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {formError && (
          <p role="alert" data-testid="form-error" className="mt-5 flex items-start gap-2 rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-800">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {formError}
          </p>
        )}

        <div className="mt-8 flex items-center gap-3">
          {step > 0 && (
            <button type="button" className={pillClass("ghost", "md", "px-4")} onClick={() => goTo(step - 1)} disabled={submitting}>
              <ArrowLeft className="h-5 w-5" aria-hidden="true" /> Back
            </button>
          )}
          <button type="submit" className={pillClass("primary", "md", "flex-1")} disabled={submitting}>
            {step < STEP_TITLES.length - 1 ? (
              <>
                Continue <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </>
            ) : submitting ? (
              <>
                <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> Sending…
              </>
            ) : (
              "Submit application"
            )}
          </button>
        </div>
      </form>

      <p className="mt-4 flex items-center justify-center gap-2 text-center text-xs text-ink-500">
        <Lock className="h-3.5 w-3.5" aria-hidden="true" /> We only use your details to review your funding request.
      </p>
    </div>
  );
}
