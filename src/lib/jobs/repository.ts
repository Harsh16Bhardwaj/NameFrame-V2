import { Prisma } from "@/generated/prisma/client";
import { CertificateJobStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors/app-error";
import { nextRetryAt } from "@/lib/jobs/retry";

const MAX_CLAIM_SIZE = 5;
const STALE_AFTER_MS = 5 * 60 * 1000;
const MAX_STALE_RECOVERY = 100;

export async function claimCertificateJobs(workerId: string, now = new Date(), limit = MAX_CLAIM_SIZE, allowedJobIds?: string[]) {
  if (!workerId || limit < 1 || limit > MAX_CLAIM_SIZE) {
    throw new AppError("INTERNAL_ERROR", "Certificate job claim configuration is invalid.");
  }

  return prisma.$transaction(async (transaction) => {
    if (allowedJobIds && allowedJobIds.length === 0) return [];
    const scope = allowedJobIds ? Prisma.sql`AND "id" IN (${Prisma.join(allowedJobIds)})` : Prisma.empty;
    const rows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "sertify"."CertificateJob"
      WHERE "deletedAt" IS NULL
        AND (
          "status" = 'PENDING'
          OR ("status" = 'RETRY_PENDING' AND "nextAttemptAt" <= ${now})
        )
        ${scope}
      ORDER BY "createdAt" ASC, "id" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `);
    const ids = rows.map((row) => row.id);
    if (!ids.length) return [];

    await transaction.certificateJob.updateMany({
      where: { id: { in: ids }, status: { in: [CertificateJobStatus.PENDING, CertificateJobStatus.RETRY_PENDING] } },
      data: { status: CertificateJobStatus.PROCESSING, claimedAt: now, claimedBy: workerId, nextAttemptAt: null },
    });
    return transaction.certificateJob.findMany({
      where: { id: { in: ids }, status: CertificateJobStatus.PROCESSING, claimedBy: workerId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  });
}

export async function recoverStaleCertificateJobs(now = new Date()) {
  const staleBefore = new Date(now.getTime() - STALE_AFTER_MS);
  return prisma.$transaction(async (transaction) => {
    const staleJobs = await transaction.$queryRaw<Array<{ id: string; attemptCount: number; maxAttempts: number }>>`
      SELECT "id", "attemptCount", "maxAttempts"
      FROM "sertify"."CertificateJob"
      WHERE "deletedAt" IS NULL
        AND "status" = 'PROCESSING'
        AND "claimedAt" < ${staleBefore}
      ORDER BY "claimedAt" ASC, "id" ASC
      LIMIT ${MAX_STALE_RECOVERY}
      FOR UPDATE SKIP LOCKED
    `;

    let retryPending = 0;
    let dead = 0;
    for (const job of staleJobs) {
      if (job.attemptCount >= job.maxAttempts) {
        await transaction.certificateJob.update({
          where: { id: job.id },
          data: {
            status: CertificateJobStatus.DEAD,
            completedAt: now,
            lastErrorCode: "STALE_JOB_RETRY_EXHAUSTED",
            lastErrorMessage: "The worker claim expired after all attempts were used.",
            claimedAt: null,
            claimedBy: null,
          },
        });
        dead += 1;
      } else {
        await transaction.certificateJob.update({
          where: { id: job.id },
          data: {
            status: CertificateJobStatus.RETRY_PENDING,
            nextAttemptAt: nextRetryAt(Math.max(1, job.attemptCount), now),
            completedAt: null,
            lastErrorCode: "STALE_WORKER_CLAIM",
            lastErrorMessage: "The previous worker claim expired before completion.",
            claimedAt: null,
            claimedBy: null,
          },
        });
        retryPending += 1;
      }
    }
    return { recovered: staleJobs.length, retryPending, dead };
  });
}

export async function beginCertificateJobAttempt(jobId: string, workerId: string, now = new Date()) {
  const updated = await prisma.certificateJob.updateMany({
    where: { id: jobId, status: CertificateJobStatus.PROCESSING, claimedBy: workerId, deletedAt: null },
    data: { attemptCount: { increment: 1 }, startedAt: now, completedAt: null },
  });
  if (updated.count !== 1) throw new AppError("CONFLICT", "The certificate job is no longer owned by this worker.");
  return prisma.certificateJob.findUniqueOrThrow({ where: { id: jobId } });
}

export async function completeCertificateJob(jobId: string, workerId: string, now = new Date()) {
  const updated = await prisma.certificateJob.updateMany({
    where: { id: jobId, status: CertificateJobStatus.PROCESSING, claimedBy: workerId, deletedAt: null },
    data: {
      status: CertificateJobStatus.COMPLETED,
      completedAt: now,
      nextAttemptAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  });
  if (updated.count !== 1) throw new AppError("CONFLICT", "The certificate job is no longer owned by this worker.");
}

export async function failCertificateJob(
  job: { id: string; attemptCount: number; maxAttempts: number },
  workerId: string,
  failure: { retryable: boolean; code: string; message: string },
  now = new Date(),
) {
  const exhausted = job.attemptCount >= job.maxAttempts;
  const status = failure.retryable && !exhausted ? CertificateJobStatus.RETRY_PENDING : CertificateJobStatus.DEAD;
  const updated = await prisma.certificateJob.updateMany({
    where: { id: job.id, status: CertificateJobStatus.PROCESSING, claimedBy: workerId, deletedAt: null },
    data: {
      status,
      nextAttemptAt: status === CertificateJobStatus.RETRY_PENDING ? nextRetryAt(job.attemptCount, now) : null,
      completedAt: status === CertificateJobStatus.DEAD ? now : null,
      claimedAt: null,
      claimedBy: null,
      lastErrorCode: failure.code,
      lastErrorMessage: failure.message.slice(0, 1000),
    },
  });
  if (updated.count !== 1) throw new AppError("CONFLICT", "The certificate job is no longer owned by this worker.");
  return status;
}
