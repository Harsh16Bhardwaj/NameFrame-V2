import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  CertificateJobStatus,
  DeliveryStatus,
  EmailProvider,
  EventStatus,
  OrganizationRole,
} from "../src/generated/prisma/enums.ts";
import { prisma } from "../src/lib/db/prisma.ts";
import { AppError } from "../src/lib/errors/app-error.ts";
import {
  addOrganizationMember,
  createOrganizationForUser,
} from "../src/lib/organizations/service.ts";
import { decryptCredential, encryptCredential } from "../src/lib/security/encryption.ts";

const runId = randomUUID();
const userIds: string[] = [];
let organizationId: string | null = null;

async function createTestUser(label: string) {
  const user = await prisma.user.create({
    data: {
      clerkUserId: `foundation_${label}_${runId}`,
      email: `foundation_${label}_${runId}@example.test`,
      name: `Foundation ${label}`,
    },
  });
  userIds.push(user.id);
  return user;
}

async function cleanUp() {
  if (organizationId) {
    await prisma.deliveryAttempt.deleteMany({
      where: { delivery: { event: { organizationId } } },
    });
    await prisma.delivery.deleteMany({ where: { event: { organizationId } } });
    await prisma.certificate.deleteMany({ where: { event: { organizationId } } });
    await prisma.certificateJob.deleteMany({ where: { event: { organizationId } } });
    await prisma.certificateTemplate.deleteMany({ where: { event: { organizationId } } });
    await prisma.certificateAsset.deleteMany({ where: { organizationId } });
    await prisma.participant.deleteMany({ where: { event: { organizationId } } });
    await prisma.bulkOperation.deleteMany({ where: { event: { organizationId } } });
    await prisma.event.deleteMany({ where: { organizationId } });
    await prisma.organizationSmtpConfig.deleteMany({ where: { organizationId } });
    await prisma.organizationMember.deleteMany({ where: { organizationId } });
    await prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: { organizationId: null },
    });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  }

  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

try {
  const leader = await createTestUser("leader");
  const member = await createTestUser("member");
  const outsider = await createTestUser("outsider");

  const organization = await createOrganizationForUser(leader.id, "Foundation Test Org");
  organizationId = organization.id;

  const synchronizedLeader = await prisma.user.findUniqueOrThrow({
    where: { id: leader.id },
    include: { membership: true },
  });
  assert.equal(synchronizedLeader.organizationId, organization.id);
  assert.equal(synchronizedLeader.membership?.role, OrganizationRole.GROUP_LEADER);

  await assert.rejects(
    () => createOrganizationForUser(leader.id, "Second Organization"),
    (error) => error instanceof AppError && error.code === "ORGANIZATION_ALREADY_EXISTS",
  );

  await addOrganizationMember(leader.id, member.id);
  const synchronizedMember = await prisma.user.findUniqueOrThrow({
    where: { id: member.id },
    include: { membership: true },
  });
  assert.equal(synchronizedMember.organizationId, organization.id);
  assert.equal(synchronizedMember.membership?.role, OrganizationRole.GROUP_MEMBER);

  await assert.rejects(
    () => addOrganizationMember(member.id, outsider.id),
    (error) => error instanceof AppError && error.code === "AUTHORIZATION_ERROR",
  );

  await assert.rejects(() =>
    prisma.organizationMember.create({
      data: {
        userId: outsider.id,
        organizationId: organization.id,
        role: OrganizationRole.GROUP_LEADER,
      },
    }),
  );

  const event = await prisma.event.create({
    data: {
      organizationId: organization.id,
      createdByUserId: leader.id,
      title: "Foundation Event",
      organizationName: organization.name,
      status: EventStatus.ACTIVE,
    },
  });

  const participant = await prisma.participant.create({
    data: {
      eventId: event.id,
      name: "Participant One",
      email: `participant_${runId}@example.test`,
      eligibleForCertificate: true,
    },
  });

  await assert.rejects(() =>
    prisma.participant.create({
      data: {
        eventId: event.id,
        name: "Duplicate Participant",
        email: participant.email,
      },
    }),
  );

  const asset = await prisma.certificateAsset.create({
    data: {
      eventId: event.id,
      organizationId: organization.id,
      uploadedByUserId: leader.id,
      publicId: `foundation/template/${runId}`,
      secureUrl: "https://example.test/template.png",
      format: "png",
      width: 1200,
      height: 850,
      bytes: 1024,
    },
  });
  const secondAsset = await prisma.certificateAsset.create({
    data: {
      eventId: event.id,
      organizationId: organization.id,
      uploadedByUserId: leader.id,
      publicId: `foundation/template-second/${runId}`,
      secureUrl: "https://example.test/second.png",
      format: "png",
      width: 1200,
      height: 850,
      bytes: 1024,
    },
  });

  const template = await prisma.certificateTemplate.create({
    data: {
      eventId: event.id,
      assetId: asset.id,
      backgroundUrl: asset.secureUrl,
      nameLeft: 0.1,
      nameTop: 0.4,
      nameRight: 0.9,
      nameBottom: 0.6,
    },
  });

  await assert.rejects(() =>
    prisma.certificateTemplate.create({
      data: {
        eventId: event.id,
        assetId: secondAsset.id,
        backgroundUrl: secondAsset.secureUrl,
        nameLeft: 0.1,
        nameTop: 0.4,
        nameRight: 0.9,
        nameBottom: 0.6,
      },
    }),
  );

  const job = await prisma.certificateJob.create({
    data: {
      eventId: event.id,
      participantId: participant.id,
      requestId: `foundation-${runId}`,
      status: CertificateJobStatus.COMPLETED,
      completedAt: new Date(),
    },
  });

  const certificate = await prisma.certificate.create({
    data: {
      certificateJobId: job.id,
      eventId: event.id,
      participantId: participant.id,
      verificationId: randomUUID(),
      artifactUrl: "https://example.test/certificate.png",
      artifactPublicId: `foundation/certificate/${runId}`,
      artifactWidth: 1200,
      artifactHeight: 850,
      participantNameSnapshot: participant.name,
      eventTitleSnapshot: event.title,
      organizationNameSnapshot: organization.name,
      templateBackgroundUrlSnapshot: template.backgroundUrl,
      nameLeftSnapshot: template.nameLeft,
      nameTopSnapshot: template.nameTop,
      nameRightSnapshot: template.nameRight,
      nameBottomSnapshot: template.nameBottom,
      fontSizeSnapshot: template.fontSize,
      fontColorSnapshot: template.fontColor,
      fontWeightSnapshot: template.fontWeight,
      textAlignSnapshot: template.textAlign,
      certificateHash: "a".repeat(64),
    },
  });

  const delivery = await prisma.delivery.create({
    data: {
      sourceCertificateJobId: job.id,
      certificateId: certificate.id,
      eventId: event.id,
      participantId: participant.id,
      recipientEmail: participant.email,
      emailSubjectSnapshot: "Foundation certificate",
      emailBodySnapshot: "Your certificate is ready.",
      status: DeliveryStatus.SENT,
    },
  });

  await prisma.deliveryAttempt.createMany({
    data: [
      {
        deliveryId: delivery.id,
        provider: EmailProvider.RESEND,
        providerRoute: "resend",
        attemptNumber: 1,
        errorCode: "EMAIL_PROVIDER_RATE_LIMIT",
        errorMessage: "Synthetic integration check",
        completedAt: new Date(),
      },
      {
        deliveryId: delivery.id,
        provider: EmailProvider.SMTP,
        providerRoute: "site-smtp",
        attemptNumber: 2,
        providerMessageId: "foundation-message-id",
        completedAt: new Date(),
      },
    ],
  });
  assert.equal(await prisma.deliveryAttempt.count({ where: { deliveryId: delivery.id } }), 2);

  const encryptedPassword = encryptCredential("foundation-smtp-password");
  await prisma.organizationSmtpConfig.create({
    data: {
      organizationId: organization.id,
      createdByUserId: leader.id,
      label: "Foundation SMTP",
      host: "smtp.example.test",
      port: 465,
      username: "sender@example.test",
      encryptedPassword,
      fromName: "Foundation Sender",
      fromEmail: "sender@example.test",
      secure: true,
    },
  });
  assert.equal(decryptCredential(encryptedPassword), "foundation-smtp-password");

  await prisma.event.update({ where: { id: event.id }, data: { deletedAt: new Date() } });
  const preservedCertificate = await prisma.certificate.findUnique({
    where: { verificationId: certificate.verificationId },
  });
  assert.ok(preservedCertificate, "issued certificate must survive event soft deletion");

  console.log("Foundation integration checks passed.");
} finally {
  await cleanUp();
  await prisma.$disconnect();
}
