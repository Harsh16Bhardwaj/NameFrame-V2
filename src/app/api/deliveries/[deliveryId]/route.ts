import { getDelivery } from "@/lib/dashboard/service";
import { errorResponse } from "@/lib/errors/http";

export async function GET(_request: Request, { params }: { params: Promise<{ deliveryId: string }> }) {
  try {
    const { deliveryId } = await params;
    return Response.json({ success: true, data: await getDelivery(deliveryId) });
  } catch (error) {
    return errorResponse(error);
  }
}
