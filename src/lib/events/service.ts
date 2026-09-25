import { EventStatus } from "@/generated/prisma/enums";
import { getOrganizationActor, requireEventAccess, requireLeaderActor } from "@/lib/auth/authorization";
import { requireGroupLeader } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors/app-error";
import { parseEventFields, validateFinalEvent, validateTemplatePresent } from "@/lib/events/validation";

const eventInclude = { template: { where: { deletedAt: null }, include: { asset: true } } } as const;

export async function getOrCreateDraft() {
  const actor = await requireLeaderActor();
  const existing = await prisma.event.findFirst({
    where: { organizationId: actor.organizationId, createdByUserId: actor.userId, status: EventStatus.DRAFT, deletedAt: null },
    include: eventInclude,
  });
  if (existing) return existing;

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId } });
  try {
    return await prisma.event.create({
      data: {
        organizationId: organization.id,
        createdByUserId: actor.userId,
        organizationName: organization.name,
        organizationLogoUrl: organization.logoUrl,
        title: "",
      },
      include: eventInclude,
    });
  } catch (error) {
    const concurrentDraft = await prisma.event.findFirst({
      where: { organizationId: actor.organizationId, createdByUserId: actor.userId, status: EventStatus.DRAFT, deletedAt: null },
      include: eventInclude,
    });
    if (concurrentDraft) return concurrentDraft;
    throw error;
  }
}

export async function listEvents({ search = "" }: { search?: string } = {}) {
  const { organizationId } = await getOrganizationActor();
  const query = search.trim().slice(0, 100);
  return prisma.event.findMany({
    where: {
      organizationId,
      deletedAt: null,
      status: { not: EventStatus.DRAFT },
      ...(query ? {
        OR: [
          { title: { contains: query, mode: "insensitive" as const } },
          { description: { contains: query, mode: "insensitive" as const } },
          { location: { contains: query, mode: "insensitive" as const } },
          { organizationName: { contains: query, mode: "insensitive" as const } },
          { certificateTitle: { contains: query, mode: "insensitive" as const } },
          { createdBy: { is: { OR: [{ name: { contains: query, mode: "insensitive" as const } }, { email: { contains: query, mode: "insensitive" as const } }] } } },
        ],
      } : {}),
    },
    include: {
      ...eventInclude,
      createdBy: { select: { name: true, email: true } },
      _count: { select: { participants: { where: { deletedAt: null } } } },
    },
    orderBy: { eventDate: "desc" },
  });
}

export async function getEvent(eventId: string) {
  await requireEventAccess(eventId);
  return prisma.event.findFirstOrThrow({ where: { id: eventId, deletedAt: null }, include: eventInclude });
}

export async function updateEvent(eventId: string, input: Record<string, unknown>) {
  await requireEventAccess(eventId);
  const fields = parseEventFields(input);
  return prisma.event.update({ where: { id: eventId }, data: fields, include: eventInclude });
}

export async function finalizeEvent(eventId: string, input: Record<string, unknown>) {
  const { actor, event } = await requireEventAccess(eventId);
  requireGroupLeader(actor);
  if (event.status !== EventStatus.DRAFT) {
    throw new AppError("EVENT_NOT_DRAFT", "Only a draft event can be finalized.");
  }
  const fields = parseEventFields(input);
  validateFinalEvent(fields);
  const template = await prisma.certificateTemplate.findFirst({ where: { eventId, deletedAt: null } });
  validateTemplatePresent(template);

  return prisma.event.update({
    where: { id: eventId },
    data: { ...fields, status: EventStatus.ACTIVE },
    include: eventInclude,
  });
}

export async function completeEvent(eventId: string) {
  const { actor, event } = await requireEventAccess(eventId);
  requireGroupLeader(actor);
  if (event.status === EventStatus.DRAFT) {
    throw new AppError("EVENT_NOT_EDITABLE", "Finalize the draft before marking it completed.");
  }
  return prisma.event.update({ where: { id: eventId }, data: { status: EventStatus.COMPLETED } });
}

export async function deleteEvent(eventId: string, confirmation: unknown) {
  const { actor, event } = await requireEventAccess(eventId);
  requireGroupLeader(actor);
  if (confirmation !== "DELETE") {
    throw new AppError("VALIDATION_ERROR", "Type DELETE to confirm event deletion.");
  }
  if (event.deletedAt) throw new AppError("EVENT_ALREADY_DELETED", "The event is already deleted.");
  return prisma.event.update({ where: { id: eventId }, data: { deletedAt: new Date() } });
}
