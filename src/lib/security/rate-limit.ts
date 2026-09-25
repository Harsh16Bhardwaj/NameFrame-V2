import { auth } from "@clerk/nextjs/server";

import { AppError } from "@/lib/errors/app-error";

export type RateLimitScope = "event-creation" | "send-initiation" | "organization-invite";

type RateLimitEntry = {
  count: number;
  expiresAt: number;
};

type RateLimitOptions = {
  key: string;
  limit: number;
  now?: number;
  scope: string;
  windowMs: number;
};

const globalForRateLimits = globalThis as typeof globalThis & {
  sertifyRateLimits?: Map<string, RateLimitEntry>;
};

const entries = globalForRateLimits.sertifyRateLimits ?? new Map<string, RateLimitEntry>();
globalForRateLimits.sertifyRateLimits = entries;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function consumeRateLimit({ key, limit, now = Date.now(), scope, windowMs }: RateLimitOptions): void {
  const entryKey = `${scope}:${key}`;
  const current = entries.get(entryKey);

  if (!current || current.expiresAt <= now) {
    entries.set(entryKey, { count: 1, expiresAt: now + windowMs });
    return;
  }

  if (current.count >= limit) {
    throw new AppError("RATE_LIMITED", "Too many requests. Please try again shortly.");
  }

  current.count += 1;
}

export function resetRateLimitsForTests(): void {
  entries.clear();
}

function policyFor(scope: RateLimitScope): { limit: number; windowMs: number } {
  if (scope === "event-creation") {
    return {
      limit: positiveInteger(process.env.EVENT_CREATION_RATE_LIMIT, 5),
      windowMs: positiveInteger(process.env.EVENT_CREATION_RATE_WINDOW_MS, 60_000),
    };
  }

  if (scope === "organization-invite") {
    return {
      limit: positiveInteger(process.env.ORGANIZATION_INVITE_RATE_LIMIT, 10),
      windowMs: positiveInteger(process.env.ORGANIZATION_INVITE_RATE_WINDOW_MS, 3_600_000),
    };
  }

  return {
    limit: positiveInteger(process.env.SEND_INITIATION_RATE_LIMIT, 20),
    windowMs: positiveInteger(process.env.SEND_INITIATION_RATE_WINDOW_MS, 60_000),
  };
}

export async function enforceAuthenticatedRateLimit(scope: RateLimitScope): Promise<void> {
  const { userId } = await auth();
  if (!userId) {
    throw new AppError("AUTHENTICATION_ERROR", "Authentication is required.");
  }

  consumeRateLimit({ key: userId, scope, ...policyFor(scope) });
}
