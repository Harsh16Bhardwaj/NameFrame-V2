import { errorResponse } from "@/lib/errors/http";
import { retryDeadCertificateJob } from "@/lib/jobs/service";
import { enforceAuthenticatedRateLimit } from "@/lib/security/rate-limit";

type Context = { params: Promise<{ jobId: string }> };

export async function POST(_request: Request, { params }: Context) {
  try {
    await enforceAuthenticatedRateLimit("send-initiation");
    const { jobId } = await params;
    const job = await retryDeadCertificateJob(jobId);
    return Response.json({ success: true, data: job });
  } catch (error) {
    return errorResponse(error);
  }
}
