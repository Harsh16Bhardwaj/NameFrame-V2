import { errorResponse } from "@/lib/errors/http";
import { findExistingParticipantEmails } from "@/lib/participants/service";

type Context = { params: Promise<{ eventId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const { eventId } = await params;
    const body = await request.json();
    const emails = await findExistingParticipantEmails(eventId, body.emails);
    return Response.json({ success: true, data: { emails } });
  } catch (error) {
    return errorResponse(error);
  }
}
