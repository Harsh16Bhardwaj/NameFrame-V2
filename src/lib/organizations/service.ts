import { OrganizationRole, type User } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors/app-error";
import { requireGroupLeader } from "@/lib/auth/permissions";
import { getOrganizationActor } from "@/lib/auth/authorization";

function normalizeOrganizationName(name: string): string {
  const normalized = name.trim();

  if (normalized.length < 2 || normalized.length > 120) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Organization name must contain between 2 and 120 characters.",
    );
  }

  return normalized;
}

export async function createOrganizationForUser(
  userId: string,
  name: string,
  logoUrl?: string,
  logoPublicId?: string,
) {
  const normalizedName = normalizeOrganizationName(name);

  return prisma.$transaction(async (transaction) => {
    const user = await transaction.user.findUnique({
      where: { id: userId },
      include: { membership: true },
    });

    if (!user) {
      throw new AppError("NOT_FOUND", "User not found.");
    }

    if (user.organizationId || user.membership) {
      throw new AppError("ORGANIZATION_ALREADY_EXISTS", "A user can belong to only one organization.");
    }

    const organization = await transaction.organization.create({
      data: {
        name: normalizedName,
        logoUrl: logoUrl || null,
        logoPublicId: logoPublicId || null,
        createdByUserId: user.id,
      },
    });

    await transaction.organizationMember.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        role: OrganizationRole.GROUP_LEADER,
      },
    });

    await transaction.user.update({
      where: { id: user.id },
      data: { organizationId: organization.id },
    });

    return organization;
  });
}

export async function addOrganizationMember(actorUserId: string, targetUserId: string) {
  return prisma.$transaction(async (transaction) => {
    const actorMembership = await transaction.organizationMember.findUnique({
      where: { userId: actorUserId },
    });

    if (!actorMembership) {
      throw new AppError("AUTHORIZATION_ERROR", "Organization membership is required.");
    }

    requireGroupLeader({
      userId: actorUserId,
      organizationId: actorMembership.organizationId,
      role: actorMembership.role,
    });

    const target = await transaction.user.findUnique({
      where: { id: targetUserId },
      include: { membership: true },
    });

    if (!target) {
      throw new AppError("NOT_FOUND", "User not found.");
    }

    if (target.organizationId || target.membership) {
      throw new AppError("CONFLICT", "The user already belongs to an organization.");
    }

    const membership = await transaction.organizationMember.create({
      data: {
        userId: target.id,
        organizationId: actorMembership.organizationId,
        role: OrganizationRole.GROUP_MEMBER,
      },
    });

    await transaction.user.update({
      where: { id: target.id },
      data: { organizationId: actorMembership.organizationId },
    });

    return membership;
  });
}

export async function removeOrganizationMember(actorUserId: string, targetUserId: string) {
  if (actorUserId === targetUserId) {
    throw new AppError("CONFLICT", "The group leader cannot remove their own membership.");
  }

  return prisma.$transaction(async (transaction) => {
    const [actorMembership, targetMembership] = await Promise.all([
      transaction.organizationMember.findUnique({ where: { userId: actorUserId } }),
      transaction.organizationMember.findUnique({ where: { userId: targetUserId } }),
    ]);

    if (!actorMembership || !targetMembership) {
      throw new AppError("NOT_FOUND", "Organization membership not found.");
    }

    requireGroupLeader({
      userId: actorUserId,
      organizationId: actorMembership.organizationId,
      role: actorMembership.role,
    });

    if (targetMembership.organizationId !== actorMembership.organizationId) {
      throw new AppError("AUTHORIZATION_ERROR", "The user is not in your organization.");
    }

    if (targetMembership.role === OrganizationRole.GROUP_LEADER) {
      throw new AppError("CONFLICT", "The sole group leader cannot be removed.");
    }

    await transaction.organizationMember.delete({ where: { userId: targetUserId } });
    return transaction.user.update({
      where: { id: targetUserId },
      data: { organizationId: null },
    });
  });
}

export async function listOrganizationMembers() {
  const actor = await getOrganizationActor();
  return prisma.organizationMember.findMany({
    where: { organizationId: actor.organizationId },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: { id: true, role: true, createdAt: true, user: { select: { id: true, name: true, email: true } } },
  });
}

export function hasOrganization(user: Pick<User, "organizationId">): boolean {
  return user.organizationId !== null;
}
