import { ensureCurrentUser } from "@/lib/auth/user-sync";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors/app-error";
import { errorResponse } from "@/lib/errors/http";
import { createOrganizationForUser } from "@/lib/organizations/service";
import { destroyImage, uploadImage } from "@/lib/uploads/cloudinary";

export async function GET() {
  try {
    const user = await ensureCurrentUser();
    if (!user.organizationId) throw new AppError("ORGANIZATION_REQUIRED", "Organization setup is required.");
    const organization = await prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId } });
    return Response.json({ success: true, data: organization });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  let uploadedPublicId: string | null = null;
  try {
    const user = await ensureCurrentUser();
    const form = await request.formData();
    const name = form.get("name");
    const logo = form.get("logo");
    if (typeof name !== "string") throw new AppError("VALIDATION_ERROR", "Organization name is required.");
    if (!(logo instanceof File) || logo.size === 0) throw new AppError("VALIDATION_ERROR", "Organization logo is required.");

    const uploaded = await uploadImage(logo, "sertify/organization-logos");
    uploadedPublicId = uploaded.public_id;
    const organization = await createOrganizationForUser(
      user.id,
      name,
      uploaded.secure_url,
      uploaded.public_id,
    );
    return Response.json({ success: true, data: organization }, { status: 201 });
  } catch (error) {
    if (uploadedPublicId) await destroyImage(uploadedPublicId).catch(() => undefined);
    return errorResponse(error);
  }
}
