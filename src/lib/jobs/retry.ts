const RETRY_DELAYS_MS = [30_000, 120_000, 600_000, 1_200_000, 1_800_000] as const;

export function retryDelayMs(attemptCount: number): number {
  const index = Math.max(0, Math.min(Math.trunc(attemptCount) - 1, RETRY_DELAYS_MS.length - 1));
  return RETRY_DELAYS_MS[index];
}

export function nextRetryAt(attemptCount: number, now = new Date()): Date {
  return new Date(now.getTime() + retryDelayMs(attemptCount));
}
