/**
 * Lead + feedback alerts. Both channels are optional and switch on by env var:
 *
 *   WEBHOOK_URL      POSTs JSON. The body has a `text` field, so a Slack
 *                    incoming webhook works as-is; Zapier / Make / HubSpot
 *                    can read the full `application` or `feedback` object.
 *   RESEND_API_KEY   + NOTIFY_EMAIL sends an email through Resend.
 *   NOTIFY_FROM      Optional "from" address (must be a domain verified in
 *                    Resend). Defaults to Resend's shared test sender.
 *
 * A failed alert never throws. Callers get back which channels delivered.
 * Applicant details are sent to your own channels only and are never logged.
 */
import { getTier } from "./calculator";
import { formatPhone, formatUSD } from "./format";
import { BRAND } from "./site-config";
import type { ApplicationRecord, FeedbackRecord } from "./storage";

export interface NotifyResult {
  /** true = delivered, false = failed, null = channel not configured. */
  webhook: boolean | null;
  email: boolean | null;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function postWebhook(payload: Record<string, unknown>): Promise<boolean | null> {
  const url = process.env.WEBHOOK_URL;
  if (!url) return null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!res.ok) console.error(`[notify] webhook responded with status ${res.status}`);
    return res.ok;
  } catch {
    console.error("[notify] webhook request failed");
    return false;
  }
}

async function sendEmail(subject: string, rows: [string, string][]): Promise<boolean | null> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL;
  if (!key || !to) return null;

  const html =
    `<h2 style="font-family:sans-serif">${esc(subject)}</h2>` +
    `<table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">` +
    rows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:4px 16px 4px 0;color:#666;vertical-align:top">${esc(k)}</td>` +
          `<td style="padding:4px 0"><strong>${esc(v)}</strong></td></tr>`,
      )
      .join("") +
    `</table>`;
  const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.NOTIFY_FROM || `${BRAND.name} Website <onboarding@resend.dev>`,
        to: to.split(",").map((s) => s.trim()).filter(Boolean),
        subject,
        html,
        text,
      }),
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!res.ok) console.error(`[notify] Resend responded with status ${res.status}`);
    return res.ok;
  } catch {
    console.error("[notify] Resend request failed");
    return false;
  }
}

export async function notifyNewApplication(app: ApplicationRecord): Promise<NotifyResult> {
  const tib = getTier(app.timeInBusiness).label;
  const summary = `New funding application ${app.id}: ${app.businessName}, ${formatUSD(app.requestedAmount)} requested, ${formatUSD(app.annualSales)} annual sales, ${tib}. Contact: ${app.fullName}, ${formatPhone(app.phone)}, ${app.email}`;

  const [webhook, email] = await Promise.all([
    postWebhook({ event: "application.created", text: summary, application: app }),
    sendEmail(`New application: ${app.businessName} (${app.id})`, [
      ["Application ID", app.id],
      ["Business", app.businessName],
      ["Industry", app.industry],
      ["Time in business", tib],
      ["Annual sales", formatUSD(app.annualSales)],
      ["Requested", formatUSD(app.requestedAmount)],
      ["Use of funds", app.useOfFunds],
      ["Contact", app.fullName],
      ["Phone", formatPhone(app.phone)],
      ["Email", app.email],
      ["Estimate shown", app.estimate ? `${formatUSD(app.estimate.low)} – ${formatUSD(app.estimate.high)}` : "None shown"],
      ["Call/SMS consent", `Yes (${app.consentRecord.version})`],
      ["Submitted", app.createdAt],
    ]),
  ]);
  return { webhook, email };
}

export async function notifyFeedback(fb: FeedbackRecord, app: ApplicationRecord): Promise<NotifyResult> {
  const summary = `Application feedback ${fb.rating}/5 from ${app.businessName} (${app.id})${fb.comment ? `: "${fb.comment}"` : ""}`;
  const [webhook, email] = await Promise.all([
    postWebhook({
      event: "feedback.created",
      text: summary,
      feedback: fb,
      application: { id: app.id, businessName: app.businessName },
    }),
    sendEmail(`Feedback ${fb.rating}/5: ${app.businessName} (${app.id})`, [
      ["Application ID", app.id],
      ["Business", app.businessName],
      ["Rating", `${fb.rating} / 5`],
      ["Comment", fb.comment || "(none)"],
    ]),
  ]);
  return { webhook, email };
}
