import { AppError } from "@/lib/errors/app-error";
import { errorResponse } from "@/lib/errors/http";
import { createSingleCertificateJob } from "@/lib/jobs/service";
import { enforceAuthenticatedRateLimit } from "@/lib/security/rate-limit";
import { dashboardListInput } from "@/lib/dashboard/request";
import { getCertificateJobs } from "@/lib/dashboard/service";
import { wakeWorkersAfterResponse } from "@/lib/jobs/wake-workers";

type Context = { params: Promise<{ eventId: string }> };

export const maxDuration = 300;

export async function GET(request: Request, { params }: Context) {
  try {
    const { eventId } = await params;
    return Response.json({ success: true, ...(await getCertificateJobs(eventId, dashboardListInput(request))) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    await enforceAuthenticatedRateLimit("send-initiation");
    const { eventId } = await params;
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new AppError("VALIDATION_ERROR", "Certificate job details must be an object.");
    }
    const values = body as Record<string, unknown>;
    const job = await createSingleCertificateJob(eventId, values.participantId, values.requestId);
    wakeWorkersAfterResponse(eventId);
    return Response.json({ success: true, data: job }, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
