import { OrganizationRole } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors/app-error";

export type OrganizationActor = {
  userId: string;
  organizationId: string;
  role: OrganizationRole;
};

export function requireGroupLeader(actor: OrganizationActor): void {
  if (actor.role !== OrganizationRole.GROUP_LEADER) {
    throw new AppError("AUTHORIZATION_ERROR", "This action requires the group leader role.");
  }
}

export function requireSameOrganization(
  actor: OrganizationActor,
  resourceOrganizationId: string,
): void {
  if (actor.organizationId !== resourceOrganizationId) {
    throw new AppError("AUTHORIZATION_ERROR", "You do not have access to this resource.");
  }
}

