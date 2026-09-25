import { dashboardListInput } from "@/lib/dashboard/request";
import { getDeliveries } from "@/lib/dashboard/service";
import { errorResponse } from "@/lib/errors/http";

export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await params;
    return Response.json({ success: true, ...(await getDeliveries(eventId, dashboardListInput(request))) });
  } catch (error) {
    return errorResponse(error);
  }
}
