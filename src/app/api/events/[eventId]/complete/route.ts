import { errorResponse } from "@/lib/errors/http";
import { completeEvent } from "@/lib/events/service";

type Context = { params: Promise<{ eventId: string }> };

export async function POST(_request: Request, { params }: Context) {
  try {
    const { eventId } = await params;
    return Response.json({ success: true, data: await completeEvent(eventId) });
  } catch (error) {
    return errorResponse(error);
  }
}
