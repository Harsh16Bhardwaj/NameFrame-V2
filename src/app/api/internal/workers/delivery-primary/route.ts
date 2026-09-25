import { runPrimaryDeliveryWorker } from "@/lib/delivery/worker";
import { AppError } from "@/lib/errors/app-error";
import { errorResponse } from "@/lib/errors/http";
import { isAuthorizedWorkerRequest } from "@/lib/jobs/worker-auth";

export async function POST(request: Request) {
  try {
    if (!isAuthorizedWorkerRequest(request)) throw new AppError("AUTHENTICATION_ERROR", "Worker authorization failed.");
    const result = await runPrimaryDeliveryWorker();
    return Response.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET = POST;
