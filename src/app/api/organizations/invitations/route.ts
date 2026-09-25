import { errorResponse } from "@/lib/errors/http";
import { createOrganizationInvitation, listOrganizationInvitations } from "@/lib/organizations/invitation-service";
import { enforceAuthenticatedRateLimit } from "@/lib/security/rate-limit";

export async function GET() {
  try { return Response.json({ success: true, data: await listOrganizationInvitations() }); }
  catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try { await enforceAuthenticatedRateLimit("organization-invite"); return Response.json({ success: true, data: await createOrganizationInvitation(await request.json()) }, { status: 201 }); }
  catch (error) { return errorResponse(error); }
}
