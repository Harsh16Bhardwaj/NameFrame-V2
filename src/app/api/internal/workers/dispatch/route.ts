import { AppError } from "@/lib/errors/app-error";
import { errorResponse } from "@/lib/errors/http";
import { isAuthorizedWorkerRequest } from "@/lib/jobs/worker-auth";
import { dispatchWorkerPools } from "@/lib/jobs/worker-pool";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    if (!isAuthorizedWorkerRequest(request)) throw new AppError("AUTHENTICATION_ERROR", "Worker authorization failed.");
    return Response.json({ success: true, data: await dispatchWorkerPools() });
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET = POST;
