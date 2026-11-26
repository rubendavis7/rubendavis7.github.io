import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { calculateEstimate, estimateRange } from "@/lib/calculator";
import { notifyNewApplication } from "@/lib/notify";
import { clientIp, isRateLimited } from "@/lib/rate-limit";
import { BRAND, CONSENT } from "@/lib/site-config";
import { saveApplication, type ApplicationRecord } from "@/lib/storage";
import { coerceDraft, validateApplication } from "@/lib/validation";

const MAX_BODY_BYTES = 10_000;
// No 0/O or 1/I/L, so an ID read over the phone can't be misheard.
const ID_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function newApplicationId(): string {
  let id = "";
  for (let i = 0; i < 8; i++) id += ID_ALPHABET[randomInt(ID_ALPHABET.length)];
  return `${BRAND.idPrefix}-${id}`;
}

function fail(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  if (isRateLimited(`apply:${ip}`, 8, 10 * 60 * 1000)) {
    return fail(429, "Too many submissions from this connection. Please wait a few minutes and try again.");
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return fail(400, "We couldn't read that request.");
  }
  if (raw.length > MAX_BODY_BYTES) return fail(413, "That request is too large.");

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, "We couldn't read that request.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fail(400, "We couldn't read that request.");
  }

  // Honeypot: real people never see or fill this field. Bots get a normal-looking reply.
  if (typeof (body as Record<string, unknown>).website === "string" && (body as Record<string, unknown>).website !== "") {
    return NextResponse.json({ ok: true, applicationId: newApplicationId(), estimate: null }, { status: 201 });
  }

  const result = validateApplication(coerceDraft(body));
  if (!result.ok) {
    return fail(422, "Some details need another look.", { fieldErrors: result.errors });
  }

  const now = new Date().toISOString();
  const estimate = estimateRange(calculateEstimate(result.data.annualSales, result.data.timeInBusiness));
  const record: ApplicationRecord = {
    id: newApplicationId(),
    createdAt: now,
    ...result.data,
    estimate,
    consentRecord: {
      version: CONSENT.version,
      text: CONSENT.text,
      at: now,
      ip,
      userAgent: (request.headers.get("user-agent") ?? "").slice(0, 300),
    },
  };

  let saved = true;
  try {
    await saveApplication(record);
  } catch {
    saved = false;
    console.error(`[apply] could not save application ${record.id} to storage`);
  }

  const alerts = await notifyNewApplication(record);
  const alerted = alerts.webhook === true || alerts.email === true;

  // The lead is only lost if it reached neither storage nor an alert channel.
  if (!saved && !alerted) {
    return fail(500, "We couldn't save your application. Please try again, or call us and we'll take it by phone.");
  }

  return NextResponse.json({ ok: true, applicationId: record.id, estimate }, { status: 201 });
}
