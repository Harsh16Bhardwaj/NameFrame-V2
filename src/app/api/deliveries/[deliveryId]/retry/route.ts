import { retryDeadDelivery } from "@/lib/delivery/manual-retry";
import { errorResponse } from "@/lib/errors/http";
import { enforceAuthenticatedRateLimit } from "@/lib/security/rate-limit";

export async function POST(_request: Request, { params }: { params: Promise<{ deliveryId: string }> }) {
  try {
    await enforceAuthenticatedRateLimit("send-initiation");
    const { deliveryId } = await params;
    return Response.json({ success: true, data: await retryDeadDelivery(deliveryId) }, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
