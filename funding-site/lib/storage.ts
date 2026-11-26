/**
 * Lead + feedback storage.
 *
 * Two drivers, picked automatically:
 *
 *  1. FILE (default). Append-only JSON-lines files in DATA_DIR (./data).
 *     Works with zero setup in dev and on any host with a persistent disk.
 *
 *  2. REDIS over REST (Upstash / Vercel KV). Used when KV_REST_API_URL and
 *     KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL / _TOKEN) are set.
 *     Use this on Vercel, where the local disk is temporary.
 *
 * Both drivers only ever append. Nothing is edited or deleted in place, so a
 * crash mid-write can't corrupt earlier records.
 *
 * Server-only: never import this from a client component.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ApplicationData } from "./validation";

export interface ApplicationRecord extends ApplicationData {
  id: string;
  createdAt: string;
  /** Estimated funding range shown to the applicant, or null if none was shown. */
  estimate: { low: number; high: number } | null;
  /** Proof of the TCPA consent the applicant gave. */
  consentRecord: {
    version: string;
    text: string;
    at: string;
    ip: string;
    userAgent: string;
  };
}

export interface FeedbackRecord {
  applicationId: string;
  rating: number;
  comment: string;
  createdAt: string;
}

interface Driver {
  append(collection: Collection, line: string): Promise<void>;
  readAll(collection: Collection): Promise<string[]>;
}

type Collection = "applications" | "feedback";

/* ------------------------------ File driver ------------------------------ */

function dataDir(): string {
  if (process.env.DATA_DIR) return path.resolve(process.env.DATA_DIR);
  // Vercel's project directory is read-only. /tmp is writable but temporary.
  if (process.env.VERCEL) return "/tmp/funding-site-data";
  return path.join(process.cwd(), "data");
}

const fileDriver: Driver = {
  async append(collection, line) {
    const dir = dataDir();
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(path.join(dir, `${collection}.jsonl`), line + "\n", "utf8");
  },
  async readAll(collection) {
    try {
      const text = await fs.readFile(path.join(dataDir(), `${collection}.jsonl`), "utf8");
      return text.split("\n").filter((l) => l.trim() !== "");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  },
};

/* --------------------------- Redis (REST) driver -------------------------- */

function redisConfig(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

async function redis(command: (string | number)[]): Promise<unknown> {
  const cfg = redisConfig();
  if (!cfg) throw new Error("Redis is not configured");
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Redis request failed with status ${res.status}`);
  const json = (await res.json()) as { result?: unknown; error?: string };
  if (json.error) throw new Error("Redis returned an error");
  return json.result;
}

const redisDriver: Driver = {
  async append(collection, line) {
    await redis(["RPUSH", `funding-site:${collection}`, line]);
  },
  async readAll(collection) {
    const result = await redis(["LRANGE", `funding-site:${collection}`, 0, -1]);
    return Array.isArray(result) ? result.filter((x): x is string => typeof x === "string") : [];
  },
};

function driver(): Driver {
  return redisConfig() ? redisDriver : fileDriver;
}

/** "file" or "redis", plus whether records will survive a restart. Shown on /admin. */
export function storageInfo(): { driver: "file" | "redis"; durable: boolean } {
  if (redisConfig()) return { driver: "redis", durable: true };
  return { driver: "file", durable: !(process.env.VERCEL && !process.env.DATA_DIR) };
}

function parseLines<T>(lines: string[]): T[] {
  const out: T[] = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      // Skip a damaged line rather than lose the whole list.
    }
  }
  return out;
}

/* -------------------------------- Public API ------------------------------ */

export async function saveApplication(record: ApplicationRecord): Promise<void> {
  await driver().append("applications", JSON.stringify(record));
}

/** Newest first. */
export async function listApplications(): Promise<ApplicationRecord[]> {
  const all = parseLines<ApplicationRecord>(await driver().readAll("applications"));
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function findApplication(id: string): Promise<ApplicationRecord | null> {
  const all = await listApplications();
  return all.find((a) => a.id === id) ?? null;
}

export async function saveFeedback(record: FeedbackRecord): Promise<void> {
  await driver().append("feedback", JSON.stringify(record));
}

/**
 * One merged entry per application. The widget posts twice (the rating on
 * click, then rating + comment), so the latest rating wins and the latest
 * non-empty comment is kept.
 */
export async function feedbackByApplication(): Promise<Map<string, FeedbackRecord>> {
  const events = parseLines<FeedbackRecord>(await driver().readAll("feedback")).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  const merged = new Map<string, FeedbackRecord>();
  for (const e of events) {
    const prev = merged.get(e.applicationId);
    merged.set(e.applicationId, {
      applicationId: e.applicationId,
      rating: e.rating,
      comment: e.comment || prev?.comment || "",
      createdAt: e.createdAt,
    });
  }
  return merged;
}
