/**
 * Password gate for /admin.
 *
 * Set ADMIN_PASSWORD to turn the page on. Signing in stores an HMAC of a fixed
 * label (keyed by the password) in an httpOnly cookie, so the password itself
 * is never stored in the browser and changing it signs everyone out.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "admin_session";
export const ADMIN_SESSION_SECONDS = 60 * 60 * 8;

export function adminEnabled(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

function sessionToken(): string | null {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return null;
  return createHmac("sha256", password).update("funding-site-admin-session-v1").digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function passwordMatches(candidate: string): boolean {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return false;
  return safeEqual(candidate, password);
}

export function issueSessionToken(): string | null {
  return sessionToken();
}

export function isValidSession(cookieValue: string | undefined): boolean {
  const expected = sessionToken();
  if (!expected || !cookieValue) return false;
  return safeEqual(cookieValue, expected);
}
