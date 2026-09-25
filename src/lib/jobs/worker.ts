import { randomUUID } from "node:crypto";

import { CertificateJobStatus } from "@/generated/prisma/enums";
import { processCertificateJob } from "@/lib/certificates/processor";
import type { CertificateJobProcessor } from "@/lib/jobs/processor";
import {
  beginCertificateJobAttempt,
  claimCertificateJobs,
  completeCertificateJob,
  failCertificateJob,
  recoverStaleCertificateJobs,
} from "@/lib/jobs/repository";
import { refreshBulkOperationProgress } from "@/lib/jobs/service";

type WorkerOptions = {
  processor?: CertificateJobProcessor;
  workerId?: string;
  now?: Date;
  jobIds?: string[];
  recoverStale?: boolean;
};

export async function runCertificateWorker(options: WorkerOptions = {}) {
  const workerId = options.workerId ?? randomUUID();
  const invocationStartedAt = options.now ?? new Date();
  const processor = options.processor ?? processCertificateJob;
  const recovery = options.recoverStale === false ? { recovered: 0, retryPending: 0, dead: 0 } : await recoverStaleCertificateJobs(invocationStartedAt);
  const claimed = await claimCertificateJobs(workerId, invocationStartedAt, 5, options.jobIds);
  const summary = { workerId, claimed: claimed.length, completed: 0, retryPending: 0, dead: 0, claimedJobIds: claimed.map((job) => job.id), recovery, startedAt: invocationStartedAt.toISOString(), completedAt: "", durationMs: 0 };

  for (const claimedJob of claimed) {
    const startedAt = new Date();
    let job;
    try {
      job = await beginCertificateJobAttempt(claimedJob.id, workerId, startedAt);
      const outcome = await processor(job, { workerId });
      if (outcome.type === "SUCCESS") {
        if (!outcome.completedByProcessor) await completeCertificateJob(job.id, workerId);
        summary.completed += 1;
        logAttempt(job, workerId, CertificateJobStatus.COMPLETED, startedAt, undefined, outcome);
      } else {
        const status = await failCertificateJob(job, workerId, {
          retryable: outcome.type === "RETRYABLE_FAILURE",
          code: outcome.code,
          message: outcome.message,
        });
        if (status === CertificateJobStatus.RETRY_PENDING) summary.retryPending += 1;
        else summary.dead += 1;
        logAttempt(job, workerId, status, startedAt, outcome.code);
      }
    } catch (error) {
      if (job) {
        const status = await failCertificateJob(job, workerId, {
          retryable: true,
          code: "UNEXPECTED_PROCESSOR_ERROR",
          message: "The certificate processor failed unexpectedly.",
        });
        if (status === CertificateJobStatus.RETRY_PENDING) summary.retryPending += 1;
        else summary.dead += 1;
        logAttempt(job, workerId, status, startedAt, "UNEXPECTED_PROCESSOR_ERROR");
      } else {
        console.error("Certificate job could not begin", { workerId, jobId: claimedJob.id, error });
      }
    } finally {
      if (claimedJob.bulkOperationId) {
        try {
          await refreshBulkOperationProgress(claimedJob.bulkOperationId);
        } catch (error) {
          console.error("Bulk operation progress refresh failed", { workerId, bulkOperationId: claimedJob.bulkOperationId, error });
        }
      }
    }
  }
  const invocationCompletedAt = new Date();
  summary.completedAt = invocationCompletedAt.toISOString();
  summary.durationMs = invocationCompletedAt.getTime() - invocationStartedAt.getTime();
  return summary;
}

function logAttempt(
  job: { id: string; eventId: string; participantId: string; bulkOperationId: string | null; attemptCount: number },
  workerId: string,
  newStatus: CertificateJobStatus,
  startedAt: Date,
  errorCode?: string,
  success?: { certificateId?: string; reused?: boolean; cloudinaryPublicId?: string },
) {
  const completedAt = new Date();
  console.info("Certificate job attempt", {
    workerId,
    jobId: job.id,
    eventId: job.eventId,
    participantId: job.participantId,
    bulkOperationId: job.bulkOperationId,
    attemptNumber: job.attemptCount,
    previousStatus: CertificateJobStatus.PROCESSING,
    newStatus,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    certificateId: success?.certificateId,
    reusedCertificate: success?.reused,
    cloudinaryPublicId: success?.cloudinaryPublicId,
    result: newStatus === CertificateJobStatus.COMPLETED ? "success" : "failure",
    errorCode,
  });
}
