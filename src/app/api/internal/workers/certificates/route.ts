import { AppError } from "@/lib/errors/app-error";
import { errorResponse } from "@/lib/errors/http";
import { isAuthorizedWorkerRequest } from "@/lib/jobs/worker-auth";
import { runCertificateWorker } from "@/lib/jobs/worker";

export async function POST(request: Request) {
  try {
    if (!isAuthorizedWorkerRequest(request)) {
      throw new AppError("AUTHENTICATION_ERROR", "Worker authorization failed.");
    }
    const result = await runCertificateWorker();
    return Response.json({
      success: true,
      data: {
        claimed: result.claimed,
        completed: result.completed,
        retryPending: result.retryPending,
        dead: result.dead,
        recovered: result.recovery.recovered,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET = POST;
