import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { BulkOperationStatus, CertificateJobStatus, EventStatus } from "../src/generated/prisma/enums.ts";
import { prisma } from "../src/lib/db/prisma.ts";
import { AppError } from "../src/lib/errors/app-error.ts";
import { completeCertificateJob } from "../src/lib/jobs/repository.ts";
import { processCertificateJobStub } from "../src/lib/jobs/processor.ts";
import {
  createBulkOperationForEvent,
  createSingleCertificateJobForEvent,
  refreshBulkOperationProgress,
  retryDeadCertificateJobForEvent,
} from "../src/lib/jobs/service.ts";
import { runCertificateWorker } from "../src/lib/jobs/worker.ts";
import { createOrganizationForUser } from "../src/lib/organizations/service.ts";

const runId = randomUUID();
let userId: string | null = null;
let organizationId: string | null = null;

async function cleanUp() {
  if (organizationId) {
    await prisma.certificateJob.deleteMany({ where: { event: { organizationId } } });
    await prisma.bulkOperation.deleteMany({ where: { event: { organizationId } } });
    await prisma.certificateTemplate.deleteMany({ where: { event: { organizationId } } });
    await prisma.certificateAsset.deleteMany({ where: { organizationId } });
    await prisma.participant.deleteMany({ where: { event: { organizationId } } });
    await prisma.event.deleteMany({ where: { organizationId } });
    await prisma.organizationMember.deleteMany({ where: { organizationId } });
    if (userId) await prisma.user.update({ where: { id: userId }, data: { organizationId: null } });
    await prisma.organization.delete({ where: { id: organizationId } });
  }
  if (userId) await prisma.user.delete({ where: { id: userId } });
}

try {
  process.env.CRON_SECRET = `cron-${runId}`;
  const { POST: invokeWorkerRoute } = await import("../src/app/api/internal/workers/certificates/route.ts");
  const unauthorizedWorkerResponse = await invokeWorkerRoute(new Request("http://localhost/api/internal/workers/certificates", {
    method: "POST",
    headers: { authorization: "Bearer incorrect-secret" },
  }));
  assert.equal(unauthorizedWorkerResponse.status, 401);

  const leader = await prisma.user.create({
    data: { clerkUserId: `s4_${runId}`, email: `s4_${runId}@example.test`, name: "Sprint Four Leader" },
  });
  userId = leader.id;
  const organization = await createOrganizationForUser(leader.id, "Sprint Four Organization");
  organizationId = organization.id;
  const event = await prisma.event.create({
    data: {
      organizationId: organization.id,
      createdByUserId: leader.id,
      title: "Worker Infrastructure",
      organizationName: organization.name,
      status: EventStatus.ACTIVE,
    },
  });
  const asset = await prisma.certificateAsset.create({
    data: {
      eventId: event.id,
      organizationId: organization.id,
      uploadedByUserId: leader.id,
      publicId: `sprint-04/${runId}`,
      secureUrl: "https://example.test/sprint-04.png",
      format: "png",
      width: 1200,
      height: 850,
      bytes: 1024,
    },
  });
  await prisma.certificateTemplate.create({
    data: {
      eventId: event.id,
      assetId: asset.id,
      backgroundUrl: asset.secureUrl,
      nameLeft: 0.2,
      nameTop: 0.4,
      nameRight: 0.8,
      nameBottom: 0.6,
    },
  });
  const participants = await Promise.all(Array.from({ length: 11 }, (_, index) => prisma.participant.create({
    data: {
      eventId: event.id,
      name: `Worker Participant ${index}`,
      email: `worker-${index}-${runId}@example.test`,
      eligibleForCertificate: index < 10,
    },
  })));

  const firstBulk = await createBulkOperationForEvent(event.id, leader.id, `bulk-${runId}`);
  const repeatedBulk = await createBulkOperationForEvent(event.id, leader.id, `bulk-${runId}`);
  assert.equal(firstBulk.id, repeatedBulk.id);
  assert.equal(firstBulk.jobs.length, 10);
  assert.equal(await prisma.bulkOperation.count({ where: { eventId: event.id } }), 1);
  assert.equal(await prisma.certificateJob.count({ where: { bulkOperationId: firstBulk.id } }), 10);

  const [workerA, workerB] = await Promise.all([
    runCertificateWorker({ workerId: `worker-a-${runId}`, processor: processCertificateJobStub }),
    runCertificateWorker({ workerId: `worker-b-${runId}`, processor: processCertificateJobStub }),
  ]);
  assert.ok(workerA.claimed <= 5 && workerB.claimed <= 5);
  assert.equal(workerA.claimed + workerB.claimed, 10);
  assert.equal(new Set([...workerA.claimedJobIds, ...workerB.claimedJobIds]).size, 10);
  assert.equal(await prisma.certificateJob.count({ where: { bulkOperationId: firstBulk.id, status: CertificateJobStatus.COMPLETED } }), 10);
  const bulkProgress = await refreshBulkOperationProgress(firstBulk.id);
  assert.equal(bulkProgress.status, BulkOperationStatus.COMPLETED);

  const singleA = await createSingleCertificateJobForEvent(event.id, participants[0].id, `single-${runId}`);
  const singleB = await createSingleCertificateJobForEvent(event.id, participants[0].id, `single-${runId}`);
  assert.equal(singleA.id, singleB.id);

  await prisma.certificateJob.update({ where: { id: singleA.id }, data: { maxAttempts: 2 } });
  const retryProcessor = async () => ({ type: "RETRYABLE_FAILURE" as const, code: "SYNTHETIC_RETRY", message: "Retry integration check" });
  await runCertificateWorker({ workerId: `retry-one-${runId}`, processor: retryProcessor });
  let retryJob = await prisma.certificateJob.findUniqueOrThrow({ where: { id: singleA.id } });
  assert.equal(retryJob.status, CertificateJobStatus.RETRY_PENDING);
  assert.equal(retryJob.attemptCount, 1);
  assert.ok(retryJob.nextAttemptAt && retryJob.nextAttemptAt > new Date(Date.now() - 1_000));
  await prisma.certificateJob.update({ where: { id: singleA.id }, data: { nextAttemptAt: new Date(Date.now() - 1_000) } });
  await runCertificateWorker({ workerId: `retry-two-${runId}`, processor: retryProcessor });
  retryJob = await prisma.certificateJob.findUniqueOrThrow({ where: { id: singleA.id } });
  assert.equal(retryJob.status, CertificateJobStatus.DEAD);
  assert.equal(retryJob.attemptCount, 2);
  assert.equal(retryJob.lastErrorCode, "SYNTHETIC_RETRY");
  const manuallyRetried = await retryDeadCertificateJobForEvent(singleA.id);
  assert.equal(manuallyRetried.status, CertificateJobStatus.PENDING);
  assert.equal(manuallyRetried.attemptCount, 0);
  await prisma.certificateJob.update({ where: { id: singleA.id }, data: { status: CertificateJobStatus.DEAD } });

  const permanent = await createSingleCertificateJobForEvent(event.id, participants[1].id, `permanent-${runId}`);
  const successAfterFailure = await createSingleCertificateJobForEvent(event.id, participants[2].id, `success-${runId}`);
  await runCertificateWorker({
    workerId: `isolated-${runId}`,
    processor: async (job) => job.id === permanent.id
      ? { type: "PERMANENT_FAILURE", code: "SYNTHETIC_PERMANENT", message: "Permanent integration check" }
      : { type: "SUCCESS" },
  });
  assert.equal((await prisma.certificateJob.findUniqueOrThrow({ where: { id: permanent.id } })).status, CertificateJobStatus.DEAD);
  assert.equal((await prisma.certificateJob.findUniqueOrThrow({ where: { id: successAfterFailure.id } })).status, CertificateJobStatus.COMPLETED);

  const stale = await prisma.certificateJob.create({
    data: {
      eventId: event.id,
      participantId: participants[3].id,
      requestId: `stale-${runId}`,
      status: CertificateJobStatus.PROCESSING,
      attemptCount: 1,
      claimedAt: new Date(Date.now() - 6 * 60 * 1000),
      claimedBy: "crashed-worker",
    },
  });
  const recovery = await runCertificateWorker({ workerId: `recovery-${runId}`, processor: processCertificateJobStub });
  assert.ok(recovery.recovery.recovered >= 1);
  const recovered = await prisma.certificateJob.findUniqueOrThrow({ where: { id: stale.id } });
  assert.equal(recovered.status, CertificateJobStatus.RETRY_PENDING);
  assert.equal(recovered.lastErrorCode, "STALE_WORKER_CLAIM");

  const owned = await prisma.certificateJob.create({
    data: {
      eventId: event.id,
      participantId: participants[4].id,
      requestId: `owned-${runId}`,
      status: CertificateJobStatus.PROCESSING,
      claimedAt: new Date(),
      claimedBy: "actual-owner",
    },
  });
  await assert.rejects(
    () => completeCertificateJob(owned.id, "wrong-owner"),
    (error) => error instanceof AppError && error.code === "CONFLICT",
  );
  assert.equal((await prisma.certificateJob.findUniqueOrThrow({ where: { id: owned.id } })).status, CertificateJobStatus.PROCESSING);

  console.log("Sprint 04 idempotency, concurrency, retry, dead-letter, isolation, recovery, and ownership checks passed.");
} finally {
  await cleanUp();
  await prisma.$disconnect();
}
