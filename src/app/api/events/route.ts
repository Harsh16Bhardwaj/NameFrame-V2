import { errorResponse } from "@/lib/errors/http";
import { getOrCreateDraft, listEvents } from "@/lib/events/service";
import { enforceAuthenticatedRateLimit } from "@/lib/security/rate-limit";

export async function GET() {
  try {
    return Response.json({ success: true, data: await listEvents() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST() {
  try {
    await enforceAuthenticatedRateLimit("event-creation");
    return Response.json({ success: true, data: await getOrCreateDraft() }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
