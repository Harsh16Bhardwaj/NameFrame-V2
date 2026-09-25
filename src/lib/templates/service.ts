import { EventStatus } from "@/generated/prisma/enums";
import { requireEventAccess, requireTemplateAccess } from "@/lib/auth/authorization";
import { requireGroupLeader } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors/app-error";
import { destroyImage, uploadImage } from "@/lib/uploads/cloudinary";

export type TemplateValues = {
  nameLeft: number;
  nameTop: number;
  nameRight: number;
  nameBottom: number;
  fontSize: number;
  fontColor: string;
  fontWeight: string;
  textAlign: string;
};

function numberValue(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new AppError("INVALID_TEMPLATE_COORDINATES", `${field} must be a number.`);
  }
  return parsed;
}

export function parseTemplateValues(input: Record<string, unknown>): TemplateValues {
  const values = {
    nameLeft: numberValue(input.nameLeft, "Left position"),
    nameTop: numberValue(input.nameTop, "Top position"),
    nameRight: numberValue(input.nameRight, "Right position"),
    nameBottom: numberValue(input.nameBottom, "Bottom position"),
    fontSize: numberValue(input.fontSize ?? 48, "Font size"),
    fontColor: typeof input.fontColor === "string" ? input.fontColor : "#000000",
    fontWeight: typeof input.fontWeight === "string" ? input.fontWeight : "600",
    textAlign: typeof input.textAlign === "string" ? input.textAlign : "center",
  };

  if (
    values.nameLeft < 0 || values.nameLeft >= values.nameRight || values.nameRight > 1 ||
    values.nameTop < 0 || values.nameTop >= values.nameBottom || values.nameBottom > 1
  ) {
    throw new AppError("INVALID_TEMPLATE_COORDINATES", "Name bounds must form a rectangle within the certificate.");
  }
  if (!Number.isInteger(values.fontSize) || values.fontSize < 8 || values.fontSize > 160) {
    throw new AppError("VALIDATION_ERROR", "Font size must be a whole number from 8 to 160.");
  }
  if (!/^#[0-9a-f]{6}$/i.test(values.fontColor)) {
    throw new AppError("VALIDATION_ERROR", "Font color must be a six-digit hex color.");
  }
  if (!["400", "500", "600", "700"].includes(values.fontWeight)) {
    throw new AppError("VALIDATION_ERROR", "Font weight is invalid.");
  }
  if (!["left", "center", "right"].includes(values.textAlign)) {
    throw new AppError("VALIDATION_ERROR", "Text alignment is invalid.");
  }
  return values;
}

export async function uploadCertificateAsset(eventId: string, file: File) {
  const { actor, event } = await requireEventAccess(eventId);
  if (event.status === EventStatus.DRAFT) requireGroupLeader(actor);
  const uploaded = await uploadImage(file, `sertify/${actor.organizationId}/certificate-backgrounds`);

  try {
    return await prisma.certificateAsset.create({
      data: {
        eventId,
        organizationId: actor.organizationId,
        uploadedByUserId: actor.userId,
        publicId: uploaded.public_id,
        secureUrl: uploaded.secure_url,
        format: uploaded.format,
        width: uploaded.width,
        height: uploaded.height,
        bytes: uploaded.bytes,
      },
    });
  } catch (error) {
    await destroyImage(uploaded.public_id).catch(() => undefined);
    throw error;
  }
}

export async function createTemplate(eventId: string, input: Record<string, unknown>) {
  const { actor, event } = await requireEventAccess(eventId);
  if (event.status === EventStatus.DRAFT) requireGroupLeader(actor);
  const values = parseTemplateValues(input);
  if (typeof input.assetId !== "string") {
    throw new AppError("TEMPLATE_REQUIRED", "Upload a certificate background first.");
  }

  return prisma.$transaction(async (transaction) => {
    const [existing, asset] = await Promise.all([
      transaction.certificateTemplate.findFirst({ where: { eventId, deletedAt: null } }),
      transaction.certificateAsset.findFirst({
        where: { id: input.assetId as string, eventId, organizationId: actor.organizationId, deletedAt: null, template: null },
      }),
    ]);
    if (existing) throw new AppError("CONFLICT", "This event already has a certificate template.");
    if (!asset) throw new AppError("TEMPLATE_REQUIRED", "The uploaded certificate background is invalid or already used.");

    return transaction.certificateTemplate.create({
      data: { eventId, assetId: asset.id, backgroundUrl: asset.secureUrl, ...values },
      include: { asset: true },
    });
  });
}

export async function updateTemplate(eventId: string, input: Record<string, unknown>) {
  if ("assetId" in input || "backgroundUrl" in input) {
    throw new AppError("TEMPLATE_BACKGROUND_IMMUTABLE", "Delete the template to use a different background image.");
  }
  const { actor, event, template } = await requireTemplateAccess(eventId);
  if (event.status === EventStatus.DRAFT) requireGroupLeader(actor);
  const values = parseTemplateValues(input);
  return prisma.certificateTemplate.update({ where: { id: template.id }, data: values, include: { asset: true } });
}

export async function deleteTemplate(eventId: string) {
  const { actor, event, template } = await requireTemplateAccess(eventId);
  if (event.status === EventStatus.DRAFT) requireGroupLeader(actor);
  return prisma.$transaction(async (transaction) => {
    await transaction.certificateTemplate.delete({ where: { id: template.id } });
    await transaction.certificateAsset.update({ where: { id: template.assetId }, data: { deletedAt: new Date() } });
    return { deleted: true };
  });
}
