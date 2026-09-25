import { errorResponse } from "@/lib/errors/http";
import { revokeOrganizationInvitation } from "@/lib/organizations/invitation-service";

export async function DELETE(_request: Request, { params }: { params: Promise<{ invitationId: string }> }) {
  try { return Response.json({ success: true, data: await revokeOrganizationInvitation((await params).invitationId) }); }
  catch (error) { return errorResponse(error); }
}
