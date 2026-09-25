import { requireEventAccess } from "@/lib/auth/authorization";
import { requireGroupLeader } from "@/lib/auth/permissions";
import { runWorkerBenchmark } from "@/lib/benchmark/worker-benchmark";
import { AppError } from "@/lib/errors/app-error";
import { errorResponse } from "@/lib/errors/http";

type Context = { params: Promise<{ eventId: string }> };

export async function POST(request: Request, { params }: Context) {
  const apiStartedAt = Date.now();
  try {
    if (process.env.NODE_ENV !== "development") throw new AppError("NOT_FOUND", "Worker benchmark is available only in development.");
    if (!process.env.CRON_SECRET) throw new AppError("INTERNAL_ERROR", "CRON_SECRET is required for the benchmark harness.");
    const { eventId } = await params;
    const { actor } = await requireEventAccess(eventId);
    requireGroupLeader(actor);
    const body = await request.json() as { count?: unknown; workers?: unknown; injectFailures?: unknown };
    const count = boundedInteger(body.count, 1, 50, 20, "count");
    const workers = boundedInteger(body.workers, 1, 10, 4, "workers");
    const result = await runWorkerBenchmark(eventId, {
      count,
      workers,
      injectFailures: body.injectFailures === true,
      origin: new URL(request.url).origin,
      requestedByUserId: actor.userId,
    });
    return Response.json({ success: true, data: { ...result, apiDurationMs: Date.now() - apiStartedAt } });
  } catch (error) {
    return errorResponse(error);
  }
}

function boundedInteger(value: unknown, minimum: number, maximum: number, fallback: number, label: string) {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new AppError("VALIDATION_ERROR", `${label} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}
