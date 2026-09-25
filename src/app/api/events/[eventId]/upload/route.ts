import { AppError } from "@/lib/errors/app-error";
import { errorResponse } from "@/lib/errors/http";
import { uploadCertificateAsset } from "@/lib/templates/service";

type Context = { params: Promise<{ eventId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const { eventId } = await params;
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new AppError("VALIDATION_ERROR", "Choose an image to upload.");
    const asset = await uploadCertificateAsset(eventId, file);
    return Response.json({ success: true, data: asset }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
