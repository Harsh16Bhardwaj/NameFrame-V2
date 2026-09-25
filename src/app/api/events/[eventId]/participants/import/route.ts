import { errorResponse } from "@/lib/errors/http";
import { importParticipants } from "@/lib/participants/service";

type Context = { params: Promise<{ eventId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const { eventId } = await params;
    const body = await request.json();
    const result = await importParticipants(eventId, body.rows);
    return Response.json({ success: result.failedCount === 0, data: result }, { status: result.failedCount ? 500 : 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
