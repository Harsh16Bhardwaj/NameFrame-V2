import { requireTemplateAccess } from "@/lib/auth/authorization";
import { errorResponse } from "@/lib/errors/http";
import { createTemplate, deleteTemplate, updateTemplate } from "@/lib/templates/service";

type Context = { params: Promise<{ eventId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { eventId } = await params;
    const { template } = await requireTemplateAccess(eventId);
    return Response.json({ success: true, data: template });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { eventId } = await params;
    return Response.json({ success: true, data: await createTemplate(eventId, await request.json()) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { eventId } = await params;
    return Response.json({ success: true, data: await updateTemplate(eventId, await request.json()) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { eventId } = await params;
    return Response.json({ success: true, data: await deleteTemplate(eventId) });
  } catch (error) {
    return errorResponse(error);
  }
}
