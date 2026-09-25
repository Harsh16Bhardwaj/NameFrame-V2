import { errorResponse } from "@/lib/errors/http";
import { finalizeEvent } from "@/lib/events/service";

type Context = { params: Promise<{ eventId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const { eventId } = await params;
    return Response.json({ success: true, data: await finalizeEvent(eventId, await request.json()) });
  } catch (error) {
    return errorResponse(error);
  }
}
