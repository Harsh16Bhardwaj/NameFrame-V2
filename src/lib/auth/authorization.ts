import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors/app-error";
import { ensureCurrentUser } from "@/lib/auth/user-sync";
import {
  requireGroupLeader,
  type OrganizationActor,
} from "@/lib/auth/permissions";

export async function getOrganizationActor(): Promise<OrganizationActor> {
  const user = await ensureCurrentUser();
  const membership = await prisma.organizationMember.findUnique({
    where: { userId: user.id },
  });

  if (!membership && !user.organizationId) {
    throw new AppError("ORGANIZATION_REQUIRED", "Create or join an organization before continuing.");
  }

  if (!membership || membership.organizationId !== user.organizationId) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Organization membership is inconsistent. Contact support before continuing.",
    );
  }

  return {
    userId: user.id,
    organizationId: membership.organizationId,
    role: membership.role,
  };
}

export async function requireTemplateAccess(eventId: string) {
  const access = await requireEventAccess(eventId);
  const template = await prisma.certificateTemplate.findFirst({
    where: { eventId, deletedAt: null },
    include: { asset: true },
  });

  if (!template) {
    throw new AppError("TEMPLATE_NOT_FOUND", "Certificate template not found.");
  }

  return { ...access, template };
}

export async function requireParticipantAccess(eventId: string, participantId: string) {
  const access = await requireEventAccess(eventId);
  const participant = await prisma.participant.findFirst({
    where: { id: participantId, eventId, deletedAt: null },
  });

  if (!participant) {
    throw new AppError("PARTICIPANT_NOT_FOUND", "Participant not found.");
  }

  return { ...access, participant };
}

export async function requireLeaderActor(): Promise<OrganizationActor> {
  const actor = await getOrganizationActor();
  requireGroupLeader(actor);
  return actor;
}

export async function requireEventAccess(eventId: string) {
  const actor = await getOrganizationActor();
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      organizationId: actor.organizationId,
      deletedAt: null,
    },
  });

  if (!event) {
    throw new AppError("NOT_FOUND", "Event not found.");
  }

  return { actor, event };
}
