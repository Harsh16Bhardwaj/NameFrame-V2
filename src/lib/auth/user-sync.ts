import { auth, currentUser } from "@clerk/nextjs/server";

import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors/app-error";
import { buildLocalUserValues, type ClerkUserSnapshot } from "@/lib/auth/clerk-user";

export async function syncLocalUser(snapshot: ClerkUserSnapshot) {
  const values = buildLocalUserValues(snapshot);

  const user = await prisma.user.upsert({
    where: { clerkUserId: values.clerkUserId },
    create: values,
    update: {
      email: values.email,
      name: values.name,
    },
  });

  if (!snapshot.invitedOrganizationId || user.organizationId) return user;

  return prisma.$transaction(async (transaction) => {
    const [freshUser, organization] = await Promise.all([
      transaction.user.findUnique({ where: { id: user.id }, include: { membership: true } }),
      transaction.organization.findUnique({ where: { id: snapshot.invitedOrganizationId! } }),
    ]);
    if (!freshUser || !organization || freshUser.organizationId || freshUser.membership) return freshUser ?? user;
    await transaction.organizationMember.create({ data: { userId: freshUser.id, organizationId: organization.id, role: "GROUP_MEMBER" } });
    return transaction.user.update({ where: { id: freshUser.id }, data: { organizationId: organization.id } });
  });
}

export async function ensureCurrentUser() {
  const { userId } = await auth();

  if (!userId) {
    throw new AppError("AUTHENTICATION_ERROR", "Authentication is required.");
  }

  const existing = await prisma.user.findUnique({ where: { clerkUserId: userId } });
  if (existing?.organizationId) {
    return existing;
  }

  const clerkUser = await currentUser();
  const primaryEmail = clerkUser?.primaryEmailAddress?.emailAddress;

  if (!clerkUser || !primaryEmail) {
    throw new AppError(
      "AUTHENTICATION_ERROR",
      "The authenticated Clerk account has no primary email address.",
    );
  }

  return syncLocalUser({
    id: clerkUser.id,
    firstName: clerkUser.firstName,
    lastName: clerkUser.lastName,
    primaryEmailAddress: primaryEmail,
    invitedOrganizationId: typeof clerkUser.publicMetadata.nameframeOrganizationId === "string" ? clerkUser.publicMetadata.nameframeOrganizationId : null,
  });
}
