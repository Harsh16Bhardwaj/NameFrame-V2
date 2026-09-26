import { retryDeadDelivery } from "@/lib/delivery/manual-retry";
import { errorResponse } from "@/lib/errors/http";
import { enforceAuthenticatedRateLimit } from "@/lib/security/rate-limit";
import { wakeWorkersAfterResponse } from "@/lib/jobs/wake-workers";

export async function POST(_request: Request, { params }: { params: Promise<{ deliveryId: string }> }) {
  try {
    await enforceAuthenticatedRateLimit("send-initiation");
    const { deliveryId } = await params;
    const delivery = await retryDeadDelivery(deliveryId);
    wakeWorkersAfterResponse(delivery.eventId);
    return Response.json({ success: true, data: delivery }, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
