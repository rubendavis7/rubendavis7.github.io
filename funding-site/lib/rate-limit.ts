/**
 * Small in-memory rate limiter. Good enough to slow down a bot hammering one
 * server instance. On serverless hosts each instance keeps its own counts, so
 * treat it as a speed bump, not a wall.
 */
const hits = new Map<string, number[]>();

/** Returns true when the caller is over the limit. */
export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);

  if (hits.size > 5000) {
    for (const [k, times] of hits) {
      if (times.every((t) => now - t >= windowMs)) hits.delete(k);
    }
  }
  return recent.length > limit;
}

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
