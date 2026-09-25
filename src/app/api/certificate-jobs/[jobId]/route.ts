import { getCertificateJob } from "@/lib/dashboard/service";
import { errorResponse } from "@/lib/errors/http";

export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await params;
    return Response.json({ success: true, data: await getCertificateJob(jobId) });
  } catch (error) {
    return errorResponse(error);
  }
}
