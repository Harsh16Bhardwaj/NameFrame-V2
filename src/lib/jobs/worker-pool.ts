import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { runPrimaryDeliveryWorker, runRetryDeliveryWorker } from "@/lib/delivery/worker";
import { runCertificateWorker } from "@/lib/jobs/worker";

export const MAX_ACTIVE_WORKERS_PER_POOL = 4;
const LEASE_MS = 75_000;
const MAX_DRAIN_MS = 4 * 60_000;
const EMPTY_CONFIRMATION_DELAY_MS = 500;
const EMPTY_CONFIRMATION_COUNT = 2;

export type WorkerPoolName = "certificate-pipeline";

type WorkerLeaseToken = { id: string; pool: WorkerPoolName; slot: number; workerId: string };
type WorkerRunSummary = {
  pool: WorkerPoolName;
  started: number;
  completed: number;
  claimed: number;
  durationMs: number;
  workers: Array<{
    slot: number;
    workerId: string;
    batches: number;
    claimed: number;
    generated: number;
    delivered: number;
    durationMs: number;
  }>;
};

export async function dispatchWorkerPools() {
  const startedAt = Date.now();
  const pipeline = await runWorkerPool("certificate-pipeline");
  return {
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    pool: pipeline,
  };
}

export async function hasRunnableWork(eventId: string, now = new Date()): Promise<boolean> {
  const [certificateJob, primaryDelivery, retryDelivery] = await Promise.all([
    prisma.certificateJob.findFirst({
      where: { eventId, deletedAt: null, OR: [{ status: "PENDING" }, { status: "RETRY_PENDING", nextAttemptAt: { lte: now } }] },
      select: { id: true },
    }),
    prisma.primaryDeliveryQueueItem.findFirst({
      where: { claimedAt: null, nextAttemptAt: { lte: now }, delivery: { eventId, deletedAt: null } },
      select: { id: true },
    }),
    prisma.retryDeliveryQueueItem.findFirst({
      where: { claimedAt: null, nextAttemptAt: { lte: now }, delivery: { eventId, deletedAt: null } },
      select: { id: true },
    }),
  ]);
  return Boolean(certificateJob || primaryDelivery || retryDelivery);
}

export async function runWorkerPool(pool: WorkerPoolName): Promise<WorkerRunSummary> {
  const startedAt = Date.now();
  const leases = await acquireWorkerLeases(pool);
  const workers = await Promise.all(leases.map((lease) => drainLease(lease)));
  return {
    pool,
    started: leases.length,
    completed: workers.length,
    claimed: workers.reduce((total, worker) => total + worker.claimed, 0),
    durationMs: Date.now() - startedAt,
    workers,
  };
}

export async function acquireWorkerLeases(pool: WorkerPoolName, now = new Date()): Promise<WorkerLeaseToken[]> {
  await prisma.workerLease.createMany({
    data: Array.from({ length: MAX_ACTIVE_WORKERS_PER_POOL }, (_, index) => ({ pool, slot: index + 1 })),
    skipDuplicates: true,
  });

  return prisma.$transaction(async (transaction) => {
    const available = await transaction.$queryRaw<Array<{ id: string; slot: number }>>(Prisma.sql`
      SELECT "id", "slot"
      FROM "sertify"."WorkerLease"
      WHERE "pool" = ${pool}
        AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= ${now})
      ORDER BY "slot"
      LIMIT ${MAX_ACTIVE_WORKERS_PER_POOL}
      FOR UPDATE SKIP LOCKED
    `);
    const tokens: WorkerLeaseToken[] = [];
    for (const lease of available) {
      const workerId = `${pool}-${lease.slot}-${randomUUID()}`;
      await transaction.workerLease.update({
        where: { id: lease.id },
        data: { workerId, claimedAt: now, heartbeatAt: now, leaseExpiresAt: new Date(now.getTime() + LEASE_MS) },
      });
      tokens.push({ id: lease.id, pool, slot: lease.slot, workerId });
    }
    return tokens;
  });
}

export async function releaseWorkerLease(lease: WorkerLeaseToken) {
  await prisma.workerLease.updateMany({
    where: { id: lease.id, workerId: lease.workerId },
    data: { workerId: null, claimedAt: null, heartbeatAt: null, leaseExpiresAt: null },
  });
}

async function renewWorkerLease(lease: WorkerLeaseToken) {
  const now = new Date();
  const updated = await prisma.workerLease.updateMany({
    where: { id: lease.id, workerId: lease.workerId },
    data: { heartbeatAt: now, leaseExpiresAt: new Date(now.getTime() + LEASE_MS) },
  });
  return updated.count === 1;
}

async function drainLease(lease: WorkerLeaseToken) {
  const startedAt = Date.now();
  let batches = 0;
  let claimed = 0;
  let generated = 0;
  let delivered = 0;
  let emptyChecks = 0;
  try {
    while (Date.now() - startedAt < MAX_DRAIN_MS) {
      if (!await renewWorkerLease(lease)) break;
      const recoverStale = lease.slot === 1 && batches === 0;
      const generation = await runCertificateWorker({ workerId: lease.workerId, recoverStale });
      const primary = await runPrimaryDeliveryWorker({ workerId: lease.workerId, recoverStale });
      const retry = await runRetryDeliveryWorker({ workerId: lease.workerId, recoverStale });
      const batchClaimed = generation.claimed + primary.claimed + retry.claimed;
      batches += 1;
      claimed += batchClaimed;
      generated += generation.completed;
      delivered += primary.sent + retry.sent;
      if (batchClaimed > 0) {
        emptyChecks = 0;
        continue;
      }
      emptyChecks += 1;
      if (emptyChecks >= EMPTY_CONFIRMATION_COUNT) break;
      await new Promise((resolve) => setTimeout(resolve, EMPTY_CONFIRMATION_DELAY_MS));
    }
    return { slot: lease.slot, workerId: lease.workerId, batches, claimed, generated, delivered, durationMs: Date.now() - startedAt };
  } finally {
    await releaseWorkerLease(lease);
  }
}
