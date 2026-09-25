import { errorResponse } from "@/lib/errors/http";
import { createParticipant, listParticipants } from "@/lib/participants/service";

type Context = { params: Promise<{ eventId: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const { eventId } = await params;
    const data = await listParticipants(eventId, new URL(request.url).searchParams);
    return Response.json({ success: true, data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { eventId } = await params;
    const participant = await createParticipant(eventId, await request.json());
    return Response.json({ success: true, data: participant }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
