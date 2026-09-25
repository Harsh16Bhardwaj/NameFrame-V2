import { randomUUID } from "node:crypto";

import { CertificateJobStatus, EventStatus } from "@/generated/prisma/enums";
import type { Certificate, CertificateJob, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { createCertificateHash } from "@/lib/certificates/integrity";
import { fitParticipantName, NameFitError } from "@/lib/certificates/name-fit";
import {
  CertificateRenderError,
  type CertificateRenderer,
  renderCertificateWithCloudinary,
} from "@/lib/certificates/renderer";
import type { CertificateJobOutcome, CertificateJobProcessor } from "@/lib/jobs/processor";

type IssuanceDomain = NonNullable<Awaited<ReturnType<typeof loadIssuanceDomain>>>;

export function createCertificateProcessor(renderer: CertificateRenderer = renderCertificateWithCloudinary): CertificateJobProcessor {
  return async (job, context) => processClaimedCertificateJob(job, context.workerId, renderer);
}

export const processCertificateJob = createCertificateProcessor();

async function processClaimedCertificateJob(
  job: CertificateJob,
  workerId: string,
  renderer: CertificateRenderer,
): Promise<CertificateJobOutcome> {
  const domain = await loadIssuanceDomain(job);
  const validationFailure = validateIssuanceDomain(domain, job);
  if (validationFailure) return validationFailure;
  if (!domain?.template || !domain.participants[0]) {
    return permanent("CERTIFICATE_GENERATION_FAILED", "Certificate generation data is unavailable.");
  }
  const participant = domain.participants[0];
  const template = domain.template;

  const existing = await prisma.certificate.findUnique({
    where: { eventId_participantId: { eventId: job.eventId, participantId: job.participantId } },
  });
  if (existing) {
    try {
      return await completeIssuance(job, workerId, domain, existing, true);
    } catch {
      return retryable("CERTIFICATE_PERSISTENCE_FAILED", "Certificate issuance could not be persisted.");
    }
  }

  let fittedName;
  try {
    fittedName = fitParticipantName({
      name: participant.name,
      sourceWidth: template.asset.width,
      sourceHeight: template.asset.height,
      bounds: {
        left: Number(template.nameLeft),
        top: Number(template.nameTop),
        right: Number(template.nameRight),
        bottom: Number(template.nameBottom),
      },
      configuredFontSize: template.fontSize,
    });
  } catch (error) {
    if (error instanceof NameFitError) return permanent(error.code, error.message);
    return permanent("INVALID_TEMPLATE_CONFIGURATION", "The certificate template configuration is invalid.");
  }

  let artifact;
  try {
    artifact = await renderer({
      eventId: job.eventId,
      participantId: job.participantId,
      backgroundUrl: template.backgroundUrl,
      participantName: participant.name,
      sourceWidth: template.asset.width,
      sourceHeight: template.asset.height,
      fontSize: fittedName.fontSize,
      fontColor: template.fontColor,
      fontWeight: template.fontWeight,
      textAlign: template.textAlign as "left" | "center" | "right",
      box: fittedName.box,
    });
  } catch (error) {
    if (error instanceof CertificateRenderError) {
      return error.retryable ? retryable(error.code, error.message) : permanent(error.code, error.message);
    }
    return retryable("CERTIFICATE_GENERATION_FAILED", "Certificate rendering failed unexpectedly.");
  }

  const issuedAt = new Date();
  const verificationId = randomUUID();
  const certificateHash = createCertificateHash({
    verificationId,
    participantName: participant.name,
    eventTitle: domain.title,
    organizationName: domain.organizationName,
    artifactUrl: artifact.artifactUrl,
    issuedAt,
  });

  try {
    return await completeIssuance(job, workerId, domain, {
      certificateJobId: job.id,
      eventId: job.eventId,
      participantId: job.participantId,
      verificationId,
      artifactUrl: artifact.artifactUrl,
      artifactPublicId: artifact.publicId,
      artifactWidth: artifact.width,
      artifactHeight: artifact.height,
      participantNameSnapshot: participant.name,
      eventTitleSnapshot: domain.title,
      organizationNameSnapshot: domain.organizationName,
      templateBackgroundUrlSnapshot: template.backgroundUrl,
      nameLeftSnapshot: template.nameLeft,
      nameTopSnapshot: template.nameTop,
      nameRightSnapshot: template.nameRight,
      nameBottomSnapshot: template.nameBottom,
      fontSizeSnapshot: fittedName.fontSize,
      fontColorSnapshot: template.fontColor,
      fontWeightSnapshot: template.fontWeight,
      textAlignSnapshot: template.textAlign,
      certificateHash,
      issuedAt,
    }, false);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const winningCertificate = await prisma.certificate.findUnique({
        where: { eventId_participantId: { eventId: job.eventId, participantId: job.participantId } },
      });
      if (winningCertificate) {
        try {
          return await completeIssuance(job, workerId, domain, winningCertificate, true);
        } catch {
          return retryable("CERTIFICATE_PERSISTENCE_FAILED", "Certificate issuance could not be persisted.");
        }
      }
    }
    return retryable("CERTIFICATE_PERSISTENCE_FAILED", "Certificate issuance could not be persisted.");
  }
}

async function loadIssuanceDomain(job: CertificateJob) {
  return prisma.event.findUnique({
    where: { id: job.eventId },
    include: {
      participants: { where: { id: job.participantId }, take: 1 },
      template: { include: { asset: true } },
    },
  });
}

function validateIssuanceDomain(domain: IssuanceDomain | null, job: CertificateJob): CertificateJobOutcome | null {
  if (!domain || domain.deletedAt) return permanent("EVENT_DELETED", "The event is unavailable.");
  if (domain.status !== EventStatus.ACTIVE && domain.status !== EventStatus.COMPLETED) {
    return permanent("EVENT_NOT_ACTIVE", "Certificates can only be generated for active or completed events.");
  }
  const participant = domain.participants[0];
  if (!participant || participant.eventId !== job.eventId || participant.deletedAt || !participant.eligibleForCertificate) {
    return permanent("PARTICIPANT_NOT_ELIGIBLE", "The participant is not eligible for certificate generation.");
  }
  const template = domain.template;
  if (!template || template.deletedAt || template.asset.deletedAt || !template.backgroundUrl) {
    return permanent("EVENT_TEMPLATE_MISSING", "The event has no active certificate template.");
  }
  if (
    !/^#[0-9a-f]{6}$/i.test(template.fontColor) ||
    !["400", "500", "600", "700"].includes(template.fontWeight) ||
    !["left", "center", "right"].includes(template.textAlign) ||
    !Number.isInteger(template.fontSize) || template.fontSize < 8 || template.fontSize > 160
  ) {
    return permanent("INVALID_TEMPLATE_CONFIGURATION", "The certificate template style is invalid.");
  }
  return null;
}

async function completeIssuance(
  job: CertificateJob,
  workerId: string,
  domain: IssuanceDomain,
  certificateData: Prisma.CertificateUncheckedCreateInput | Certificate,
  reused: boolean,
): Promise<CertificateJobOutcome> {
  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.certificate.findUnique({
      where: { eventId_participantId: { eventId: job.eventId, participantId: job.participantId } },
    });
    const certificate = existing ?? await transaction.certificate.create({ data: certificateData as Prisma.CertificateUncheckedCreateInput });
    const delivery = await transaction.delivery.upsert({
      where: { sourceCertificateJobId: job.id },
      create: {
        sourceCertificateJobId: job.id,
        certificateId: certificate.id,
        eventId: job.eventId,
        participantId: job.participantId,
        bulkOperationId: job.bulkOperationId,
        recipientEmail: domain.participants[0].email,
        emailSubjectSnapshot: domain.emailSubject ?? "",
        emailBodySnapshot: domain.emailBody ?? "",
      },
      update: {},
    });
    await transaction.primaryDeliveryQueueItem.upsert({
      where: { deliveryId: delivery.id },
      create: { deliveryId: delivery.id },
      update: {},
    });
    const completion = await transaction.certificateJob.updateMany({
      where: { id: job.id, status: CertificateJobStatus.PROCESSING, claimedBy: workerId, deletedAt: null },
      data: {
        status: CertificateJobStatus.COMPLETED,
        completedAt: new Date(),
        nextAttemptAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    if (completion.count !== 1) throw new Error("Certificate job claim was lost before issuance completed.");
    return {
      type: "SUCCESS" as const,
      completedByProcessor: true,
      certificateId: certificate.id,
      deliveryId: delivery.id,
      reused: reused || Boolean(existing),
      cloudinaryPublicId: certificate.artifactPublicId,
    };
  });
}

function permanent(code: string, message: string): CertificateJobOutcome {
  return { type: "PERMANENT_FAILURE", code, message };
}

function retryable(code: string, message: string): CertificateJobOutcome {
  return { type: "RETRYABLE_FAILURE", code, message };
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}
