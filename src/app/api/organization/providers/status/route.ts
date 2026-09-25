import { getProviderStatus } from "@/lib/dashboard/service";
import { errorResponse } from "@/lib/errors/http";

export async function GET() {
  try {
    return Response.json({ success: true, data: await getProviderStatus() });
  } catch (error) {
    return errorResponse(error);
  }
}
