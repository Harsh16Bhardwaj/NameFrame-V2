import { errorResponse } from "@/lib/errors/http";
import { createOrganizationSmtpConfig, listOrganizationSmtpConfigs } from "@/lib/delivery/smtp-config-service";

export async function GET() {
  try {
    return Response.json({ success: true, data: await listOrganizationSmtpConfigs() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const config = await createOrganizationSmtpConfig(await request.json());
    return Response.json({ success: true, data: config }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
