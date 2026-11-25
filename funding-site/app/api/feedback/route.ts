import { NextResponse } from "next/server";
import { notifyFeedback } from "@/lib/notify";
import { clientIp, isRateLimited } from "@/lib/rate-limit";
import { findApplication, saveFeedback, type FeedbackRecord } from "@/lib/storage";
import { validateFeedback } from "@/lib/validation";

const MAX_BODY_BYTES = 5_000;

function fail(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  if (isRateLimited(`feedback:${ip}`, 20, 10 * 60 * 1000)) {
    return fail(429, "Too many requests. Please wait a few minutes and try again.");
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return fail(413, "That request is too large.");
    body = JSON.parse(raw);
  } catch {
    return fail(400, "We couldn't read that request.");
  }

  const result = validateFeedback(body);
  if (!result.ok) return fail(422, "That feedback couldn't be saved.", { fieldErrors: result.errors });

  let application;
  try {
    application = await findApplication(result.data.applicationId);
  } catch {
    console.error("[feedback] could not read applications from storage");
    return fail(500, "We couldn't save your feedback. Please try again.");
  }
  if (!application) return fail(404, "We couldn't find that application.");

  const record: FeedbackRecord = { ...result.data, createdAt: new Date().toISOString() };
  try {
    await saveFeedback(record);
  } catch {
    console.error(`[feedback] could not save feedback for ${record.applicationId}`);
    return fail(500, "We couldn't save your feedback. Please try again.");
  }

  await notifyFeedback(record, application);
  return NextResponse.json({ ok: true });
}
