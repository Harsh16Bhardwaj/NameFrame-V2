import { validateOrganizationSmtpConnection } from "@/lib/delivery/smtp-config-service";
import { errorResponse } from "@/lib/errors/http";

export async function POST(request: Request) {
  try {
    return Response.json({ success: true, data: await validateOrganizationSmtpConnection(await request.json()) });
  } catch (error) {
    return errorResponse(error);
  }
}
