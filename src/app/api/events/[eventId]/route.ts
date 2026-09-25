import { errorResponse } from "@/lib/errors/http";
import { deleteEvent, getEvent, updateEvent } from "@/lib/events/service";

type Context = { params: Promise<{ eventId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { eventId } = await params;
    return Response.json({ success: true, data: await getEvent(eventId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { eventId } = await params;
    return Response.json({ success: true, data: await updateEvent(eventId, await request.json()) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const { eventId } = await params;
    const body = await request.json();
    await deleteEvent(eventId, body.confirmation);
    return Response.json({ success: true, data: { deleted: true } });
  } catch (error) {
    return errorResponse(error);
  }
}
