import { CertificateJobStatus } from "@/generated/prisma/enums";
import { getOrganizationActor, requireEventAccess } from "@/lib/auth/authorization";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors/app-error";
import { assertEventAllowsSending } from "@/lib/events/rules";
import { deriveBulkStatusFromJobs } from "@/lib/jobs/bulk-operation";

function normalizeRequestId(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 200) {
    throw new AppError("VALIDATION_ERROR", `${fieldName} must contain 1 to 200 characters.`);
  }
  return value.trim();
}

async function requireSendReadyEvent(eventId: string) {
  const access = await requireEventAccess(eventId);
  await assertEventSendReady(eventId);
  return access;
}

async function assertEventSendReady(eventId: string) {
  const event = await prisma.event.findFirst({ where: { id: eventId, deletedAt: null }, select: { status: true } });
  if (!event) throw new AppError("EVENT_NOT_FOUND", "Event not found.");
  assertEventAllowsSending(event.status);
  const template = await prisma.certificateTemplate.findFirst({ where: { eventId, deletedAt: null }, select: { id: true } });
  if (!template) throw new AppError("TEMPLATE_REQUIRED", "Create a certificate template before creating certificate jobs.");
}

export async function createBulkOperation(eventId: string, operationRequestIdValue: unknown) {
  const { actor } = await requireSendReadyEvent(eventId);
  return createBulkOperationForEvent(eventId, actor.userId, operationRequestIdValue);
}

export async function createBulkOperationForEvent(eventId: string, requestedByUserId: string, operationRequestIdValue: unknown) {
  await assertEventSendReady(eventId);
  const operationRequestId = normalizeRequestId(operationRequestIdValue, "Operation request ID");
  const existing = await prisma.bulkOperation.findUnique({
    where: { eventId_operationRequestId: { eventId, operationRequestId } },
    include: { jobs: true },
  });
  if (existing) return existing;

  try {
    return await prisma.$transaction(async (transaction) => {
      const participants = await transaction.participant.findMany({
        where: { eventId, eligibleForCertificate: true, deletedAt: null },
        select: { id: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      if (!participants.length) throw new AppError("CONFLICT", "The event has no eligible participants.");

      const operation = await transaction.bulkOperation.create({
        data: {
          eventId,
          requestedByUserId,
          operationRequestId,
          totalCount: participants.length,
        },
      });
      await transaction.certificateJob.createMany({
        data: participants.map((participant) => ({
          eventId,
          participantId: participant.id,
          bulkOperationId: operation.id,
          requestId: operationRequestId,
        })),
      });
      return transaction.bulkOperation.findUniqueOrThrow({ where: { id: operation.id }, include: { jobs: true } });
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return prisma.bulkOperation.findUniqueOrThrow({
        where: { eventId_operationRequestId: { eventId, operationRequestId } },
        include: { jobs: true },
      });
    }
    throw error;
  }
}

export async function createSingleCertificateJob(eventId: string, participantIdValue: unknown, requestIdValue: unknown) {
  await requireSendReadyEvent(eventId);
  return createSingleCertificateJobForEvent(eventId, participantIdValue, requestIdValue);
}

export async function createSingleCertificateJobForEvent(eventId: string, participantIdValue: unknown, requestIdValue: unknown) {
  await assertEventSendReady(eventId);
  const participantId = normalizeRequestId(participantIdValue, "Participant ID");
  const requestId = normalizeRequestId(requestIdValue, "Request ID");
  const participant = await prisma.participant.findFirst({
    where: { id: participantId, eventId, deletedAt: null, eligibleForCertificate: true },
    select: { id: true },
  });
  if (!participant) throw new AppError("PARTICIPANT_NOT_FOUND", "Eligible participant not found.");

  return prisma.certificateJob.upsert({
    where: { eventId_participantId_requestId: { eventId, participantId, requestId } },
    create: { eventId, participantId, requestId },
    update: {},
  });
}

export async function retryDeadCertificateJob(jobId: string) {
  const actor = await getOrganizationActor();
  const job = await prisma.certificateJob.findFirst({
    where: { id: jobId, deletedAt: null, event: { organizationId: actor.organizationId } },
  });
  if (!job) throw new AppError("NOT_FOUND", "Certificate job not found.");
  return retryDeadCertificateJobForEvent(job.id);
}

export async function retryDeadCertificateJobForEvent(jobId: string) {
  const job = await prisma.certificateJob.findFirst({
    where: { id: jobId, deletedAt: null },
    include: {
      event: { select: { status: true, deletedAt: true, template: { select: { id: true, deletedAt: true } } } },
      participant: { select: { eligibleForCertificate: true, deletedAt: true } },
    },
  });
  if (!job) throw new AppError("NOT_FOUND", "Certificate job not found.");
  if (job.status !== CertificateJobStatus.DEAD) throw new AppError("CONFLICT", "Only dead certificate jobs can be retried manually.");
  if (job.event.deletedAt) throw new AppError("EVENT_NOT_FOUND", "The event is no longer available.");
  assertEventAllowsSending(job.event.status);
  if (!job.participant.eligibleForCertificate || job.participant.deletedAt) {
    throw new AppError("PARTICIPANT_NOT_ELIGIBLE", "Participant is no longer eligible for a certificate.");
  }
  if (!job.event.template || job.event.template.deletedAt) {
    throw new AppError("EVENT_TEMPLATE_MISSING", "Certificate template is missing.");
  }
  return prisma.certificateJob.update({
    where: { id: job.id },
    data: {
      status: CertificateJobStatus.PENDING,
      attemptCount: 0,
      nextAttemptAt: null,
      claimedAt: null,
      claimedBy: null,
      startedAt: null,
      completedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  });
}

export async function refreshBulkOperationProgress(bulkOperationId: string) {
  const operation = await prisma.bulkOperation.findUniqueOrThrow({ where: { id: bulkOperationId }, select: { startedAt: true } });
  const groups = await prisma.certificateJob.groupBy({
    by: ["status"],
    where: { bulkOperationId, deletedAt: null },
    _count: { _all: true },
  });
  const count = (status: CertificateJobStatus) => groups.find((group) => group.status === status)?._count._all ?? 0;
  const completed = count(CertificateJobStatus.COMPLETED);
  const dead = count(CertificateJobStatus.DEAD);
  const processing = count(CertificateJobStatus.PROCESSING);
  const pending = count(CertificateJobStatus.PENDING) + count(CertificateJobStatus.RETRY_PENDING);
  const total = completed + dead + processing + pending;
  const status = deriveBulkStatusFromJobs({ total, pending, processing, completed, dead });
  const terminal = completed + dead === total && total > 0;
  return prisma.bulkOperation.update({
    where: { id: bulkOperationId },
    data: {
      status,
      totalCount: total,
      completedCount: completed,
      failedCount: dead,
      startedAt: !operation.startedAt && (processing || completed || dead) ? new Date() : undefined,
      completedAt: terminal ? new Date() : null,
    },
  });
}
