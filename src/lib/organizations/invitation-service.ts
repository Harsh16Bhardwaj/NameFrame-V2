import { clerkClient } from "@clerk/nextjs/server";

import { requireLeaderActor } from "@/lib/auth/authorization";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors/app-error";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const METADATA_KEY = "nameframeOrganizationId";

export async function listOrganizationInvitations() {
  const actor = await requireLeaderActor();
  const client = await clerkClient();
  const result = await client.invitations.getInvitationList({ limit: 100, status: "pending", orderBy: "-created_at" });
  return result.data.filter((invite) => invite.publicMetadata?.[METADATA_KEY] === actor.organizationId).map(safeInvitation);
}

export async function createOrganizationInvitation(input: unknown) {
  const actor = await requireLeaderActor();
  const emailAddress = invitationEmail(input);
  const existing = await prisma.user.findUnique({ where: { email: emailAddress }, select: { organizationId: true } });
  if (existing?.organizationId === actor.organizationId) throw new AppError("CONFLICT", "This person is already an organization member.");
  if (existing?.organizationId) throw new AppError("CONFLICT", "This person already belongs to another organization.");
  const client = await clerkClient();
  const pending = await client.invitations.getInvitationList({ limit: 100, status: "pending", query: emailAddress });
  if (pending.data.some((invite) => invite.emailAddress.toLowerCase() === emailAddress && invite.publicMetadata?.[METADATA_KEY] === actor.organizationId)) {
    throw new AppError("CONFLICT", "An active invitation already exists for this email address.");
  }
  try {
    const invitation = await client.invitations.createInvitation({
      emailAddress,
      expiresInDays: 14,
      ignoreExisting: true,
      notify: true,
      redirectUrl: "/organization",
      publicMetadata: { [METADATA_KEY]: actor.organizationId, nameframeInvitedBy: actor.userId },
    });
    return safeInvitation(invitation);
  } catch (error) {
    throw new AppError("CONFLICT", "An active invitation already exists or the invitation could not be sent.", { cause: error });
  }
}

export async function revokeOrganizationInvitation(invitationId: string) {
  const actor = await requireLeaderActor();
  const client = await clerkClient();
  const result = await client.invitations.getInvitationList({ limit: 100, status: "pending", query: invitationId });
  const invitation = result.data.find((item) => item.id === invitationId && item.publicMetadata?.[METADATA_KEY] === actor.organizationId);
  if (!invitation) throw new AppError("NOT_FOUND", "Organization invitation not found.");
  return safeInvitation(await client.invitations.revokeInvitation(invitationId));
}

function invitationEmail(input: unknown) {
  const email = input && typeof input === "object" && !Array.isArray(input) && typeof (input as { email?: unknown }).email === "string" ? (input as { email: string }).email.trim().toLowerCase() : "";
  if (!email || email.length > 320 || !EMAIL_PATTERN.test(email)) throw new AppError("VALIDATION_ERROR", "Enter a valid invitation email address.");
  return email;
}

function safeInvitation(invitation: { id: string; emailAddress: string; status: string; createdAt: number; updatedAt: number }) {
  return { id: invitation.id, emailAddress: invitation.emailAddress, status: invitation.status, createdAt: invitation.createdAt, updatedAt: invitation.updatedAt };
}
