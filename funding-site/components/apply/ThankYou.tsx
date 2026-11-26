import { CircleCheck } from "lucide-react";
import { getTier } from "@/lib/calculator";
import { formatUSD } from "@/lib/format";
import { CONTACT, TIMING } from "@/lib/site-config";
import type { ApplicationData } from "@/lib/validation";
import { VerifyTag } from "../ui";
import { FeedbackWidget } from "./FeedbackWidget";

export function ThankYou({
  applicationId,
  estimate,
  data,
}: {
  applicationId: string;
  estimate: { low: number; high: number } | null;
  data: ApplicationData;
}) {
  const firstName = data.fullName.split(/\s+/)[0];

  const summary: [string, string][] = [
    ["Business", data.businessName],
    ["Time in business", getTier(data.timeInBusiness).label],
    ["Annual sales", formatUSD(data.annualSales)],
    ["Amount requested", formatUSD(data.requestedAmount)],
    ["Use of funds", data.useOfFunds],
  ];

  return (
    <div className="mx-auto max-w-xl" data-testid="thank-you">
      <div className="rounded-3xl border-2 border-ink-100 bg-white p-6 sm:p-8">
        <CircleCheck className="h-12 w-12 text-brand-600" aria-hidden="true" />
        <h1 tabIndex={-1} className="mt-4 text-3xl font-extrabold tracking-tight text-ink-950">
          Got it, {firstName}. Your application is in.
        </h1>
        <p className="mt-2 text-ink-600">
          Reference <strong data-testid="application-id" className="font-bold text-ink-950">{applicationId}</strong>. Keep it handy in case you call us.
        </p>

        <div className="mt-6 rounded-2xl bg-ink-950 p-5 text-white">
          <p className="text-sm font-semibold text-ink-300">
            Your estimated range <VerifyTag k="calculator" className="ml-1" />
          </p>
          {estimate ? (
            <p data-testid="estimate-range" className="mt-1 text-3xl font-extrabold tracking-tight tabular-nums sm:text-4xl">
              {formatUSD(estimate.low)} – {formatUSD(estimate.high)}
            </p>
          ) : (
            <p data-testid="estimate-range" className="mt-1 text-xl font-bold">
              A specialist will review your numbers and call you with what&apos;s possible.
            </p>
          )}
          <p className="mt-2 text-xs leading-relaxed text-ink-300">
            Estimate only, based on what you entered. Not an offer or an approval. Final terms are set in
            underwriting.
          </p>
        </div>

        <dl className="mt-6 divide-y divide-ink-100 text-sm">
          {summary.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2.5">
              <dt className="text-ink-600">{k}</dt>
              <dd className="text-right font-semibold text-ink-950">{v}</dd>
            </div>
          ))}
        </dl>

        <h2 className="mt-7 text-lg font-extrabold text-ink-950">What happens next</h2>
        <p className="mt-1 font-semibold text-ink-800">
          Documents can come later. A specialist will reach out {TIMING.specialistResponse}. <VerifyTag k="timing" />
        </p>
        <ol className="mt-3 space-y-2.5 text-ink-700">
          {[
            "A specialist reviews what you sent.",
            `They call or text you at the number you gave us. Pick up if you can.`,
            "If it looks like a fit, they'll ask for your recent business bank statements.",
          ].map((line, i) => (
            <li key={line} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-950 text-xs font-bold text-white">
                {i + 1}
              </span>
              {line}
            </li>
          ))}
        </ol>
        <p className="mt-5 text-sm text-ink-600">
          Rather not wait? Call {CONTACT.phoneDisplay} <VerifyTag k="contact" />
        </p>
      </div>

      <FeedbackWidget applicationId={applicationId} />
    </div>
  );
}
