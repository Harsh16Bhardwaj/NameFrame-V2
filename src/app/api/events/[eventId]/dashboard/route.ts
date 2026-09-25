import { getEventDashboard } from "@/lib/dashboard/service";
import { errorResponse } from "@/lib/errors/http";

export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await params;
    return Response.json({ success: true, data: await getEventDashboard(eventId) });
  } catch (error) {
    return errorResponse(error);
  }
}
