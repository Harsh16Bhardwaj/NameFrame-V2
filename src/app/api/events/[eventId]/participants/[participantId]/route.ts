import { errorResponse } from "@/lib/errors/http";
import { deleteParticipant, updateParticipant } from "@/lib/participants/service";

type Context = { params: Promise<{ eventId: string; participantId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { eventId, participantId } = await params;
    const participant = await updateParticipant(eventId, participantId, await request.json());
    return Response.json({ success: true, data: participant });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { eventId, participantId } = await params;
    await deleteParticipant(eventId, participantId);
    return Response.json({ success: true, data: { deleted: true } });
  } catch (error) {
    return errorResponse(error);
  }
}
