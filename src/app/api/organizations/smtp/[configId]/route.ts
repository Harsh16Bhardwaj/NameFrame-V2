import { disableOrganizationSmtpConfig, updateOrganizationSmtpConfig } from "@/lib/delivery/smtp-config-service";
import { errorResponse } from "@/lib/errors/http";

type Context = { params: Promise<{ configId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { configId } = await params;
    return Response.json({ success: true, data: await updateOrganizationSmtpConfig(configId, await request.json()) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { configId } = await params;
    return Response.json({ success: true, data: await disableOrganizationSmtpConfig(configId) });
  } catch (error) {
    return errorResponse(error);
  }
}
