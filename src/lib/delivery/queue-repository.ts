import { Prisma } from "@/generated/prisma/client";
import { DeliveryStatus, type EmailProvider } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";

const CLAIM_LIMIT = 5;
const STALE_AFTER_MS = 5 * 60_000;

export type DeliveryQueueKind = "primary" | "retry";

export async function claimPrimaryDeliveryQueue(workerId: string, now = new Date(), allowedDeliveryIds?: string[]) {
  return prisma.$transaction(async (transaction) => {
    if (allowedDeliveryIds && allowedDeliveryIds.length === 0) return [];
    const scope = allowedDeliveryIds ? Prisma.sql`AND "deliveryId" IN (${Prisma.join(allowedDeliveryIds)})` : Prisma.empty;
    const rows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "sertify"."PrimaryDeliveryQueueItem"
      WHERE "claimedAt" IS NULL AND "nextAttemptAt" <= ${now}
      ${scope}
      ORDER BY "nextAttemptAt", "createdAt", "id"
      LIMIT ${CLAIM_LIMIT}
      FOR UPDATE SKIP LOCKED
    `);
    const ids = rows.map((row) => row.id);
    if (!ids.length) return [];
    await transaction.primaryDeliveryQueueItem.updateMany({
      where: { id: { in: ids }, claimedAt: null },
      data: { claimedAt: now, claimedBy: workerId },
    });
    return transaction.primaryDeliveryQueueItem.findMany({ where: { id: { in: ids }, claimedBy: workerId } });
  });
}

export async function claimRetryDeliveryQueue(workerId: string, now = new Date(), allowedDeliveryIds?: string[]) {
  return prisma.$transaction(async (transaction) => {
    if (allowedDeliveryIds && allowedDeliveryIds.length === 0) return [];
    const scope = allowedDeliveryIds ? Prisma.sql`AND "deliveryId" IN (${Prisma.join(allowedDeliveryIds)})` : Prisma.empty;
    const rows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "sertify"."RetryDeliveryQueueItem"
      WHERE "claimedAt" IS NULL AND "nextAttemptAt" <= ${now}
      ${scope}
      ORDER BY "nextAttemptAt", "createdAt", "id"
      LIMIT ${CLAIM_LIMIT}
      FOR UPDATE SKIP LOCKED
    `);
    const ids = rows.map((row) => row.id);
    if (!ids.length) return [];
    await transaction.retryDeliveryQueueItem.updateMany({
      where: { id: { in: ids }, claimedAt: null },
      data: { claimedAt: now, claimedBy: workerId },
    });
    return transaction.retryDeliveryQueueItem.findMany({ where: { id: { in: ids }, claimedBy: workerId } });
  });
}

export async function recoverStaleDeliveryClaims(now = new Date()) {
  const staleBefore = new Date(now.getTime() - STALE_AFTER_MS);
  return prisma.$transaction(async (transaction) => {
    const [primaryItems, retryItems] = await Promise.all([
      transaction.primaryDeliveryQueueItem.findMany({ where: { claimedAt: { lt: staleBefore } }, select: { deliveryId: true } }),
      transaction.retryDeliveryQueueItem.findMany({ where: { claimedAt: { lt: staleBefore } }, select: { deliveryId: true } }),
    ]);
    const primary = await transaction.primaryDeliveryQueueItem.updateMany({
      where: { claimedAt: { lt: staleBefore } },
      data: { claimedAt: null, claimedBy: null },
    });
    const retry = await transaction.retryDeliveryQueueItem.updateMany({
      where: { claimedAt: { lt: staleBefore } },
      data: { claimedAt: null, claimedBy: null },
    });
    if (primaryItems.length) {
      await transaction.delivery.updateMany({
        where: { id: { in: primaryItems.map((item) => item.deliveryId) }, status: DeliveryStatus.PROCESSING },
        data: { status: DeliveryStatus.PENDING },
      });
    }
    if (retryItems.length) {
      await transaction.delivery.updateMany({
        where: { id: { in: retryItems.map((item) => item.deliveryId) }, status: DeliveryStatus.PROCESSING },
        data: { status: DeliveryStatus.RETRY_PENDING },
      });
    }
    return { primary: primary.count, retry: retry.count };
  });
}

export async function loadDeliveryForProcessing(deliveryId: string) {
  return prisma.delivery.findFirst({
    where: { id: deliveryId, deletedAt: null },
    include: {
      certificate: true,
      event: { select: { organizationId: true } },
    },
  });
}

export async function releaseDeliveryClaim(
  kind: DeliveryQueueKind,
  queueItemId: string,
  workerId: string,
  nextAttemptAt: Date,
  code: string,
) {
  const data = { claimedAt: null, claimedBy: null, nextAttemptAt, lastErrorCode: code };
  if (kind === "primary") {
    return prisma.primaryDeliveryQueueItem.updateMany({ where: { id: queueItemId, claimedBy: workerId }, data });
  }
  return prisma.retryDeliveryQueueItem.updateMany({ where: { id: queueItemId, claimedBy: workerId }, data });
}

export async function beginDeliveryAttempt(input: {
  kind: DeliveryQueueKind;
  queueItemId: string;
  deliveryId: string;
  workerId: string;
  provider: EmailProvider;
  providerRoute: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (transaction) => {
    const queueUpdate = input.kind === "primary"
      ? await transaction.primaryDeliveryQueueItem.updateMany({
          where: { id: input.queueItemId, deliveryId: input.deliveryId, claimedBy: input.workerId },
          data: { attemptCount: { increment: 1 }, provider: input.provider, providerRoute: input.providerRoute },
        })
      : await transaction.retryDeliveryQueueItem.updateMany({
          where: { id: input.queueItemId, deliveryId: input.deliveryId, claimedBy: input.workerId },
          data: { attemptCount: { increment: 1 }, provider: input.provider, providerRoute: input.providerRoute },
        });
    if (queueUpdate.count !== 1) throw new Error("Delivery queue claim is no longer owned by this worker.");

    const delivery = await transaction.delivery.update({
      where: { id: input.deliveryId },
      data: { status: DeliveryStatus.PROCESSING, startedAt: now, attemptCount: { increment: 1 } },
    });
    const attempt = await transaction.deliveryAttempt.create({
      data: {
        deliveryId: input.deliveryId,
        provider: input.provider,
        providerRoute: input.providerRoute,
        attemptNumber: delivery.attemptCount,
        startedAt: now,
      },
    });
    return { attempt, delivery };
  });
}

export async function completeDeliveryAttempt(input: {
  kind: DeliveryQueueKind;
  queueItemId: string;
  deliveryId: string;
  attemptId: string;
  workerId: string;
  providerMessageId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  await prisma.$transaction(async (transaction) => {
    await transaction.deliveryAttempt.update({
      where: { id: input.attemptId },
      data: { completedAt: now, providerMessageId: input.providerMessageId },
    });
    await transaction.delivery.update({
      where: { id: input.deliveryId },
      data: {
        status: DeliveryStatus.SENT,
        completedAt: now,
        claimedAt: null,
        claimedBy: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    if (input.kind === "primary") {
      await transaction.primaryDeliveryQueueItem.deleteMany({ where: { id: input.queueItemId, claimedBy: input.workerId } });
    } else {
      await transaction.retryDeliveryQueueItem.deleteMany({ where: { id: input.queueItemId, claimedBy: input.workerId } });
    }
  });
}

export async function failDeliveryAttempt(input: {
  kind: DeliveryQueueKind;
  queueItemId: string;
  deliveryId: string;
  attemptId: string;
  workerId: string;
  queueAttemptCount: number;
  queueMaxAttempts: number;
  provider: EmailProvider;
  providerRoute: string;
  retryable: boolean;
  code: string;
  message: string;
  backupProvider?: EmailProvider;
  backupProviderRoute?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const message = input.message.slice(0, 1000);
  return prisma.$transaction(async (transaction) => {
    await transaction.deliveryAttempt.update({
      where: { id: input.attemptId },
      data: { completedAt: now, errorCode: input.code, errorMessage: message },
    });
    if (!input.retryable) {
      await moveToDeadLetter(transaction, input, now, message);
      return DeliveryStatus.DEAD;
    }
    if (input.queueAttemptCount < input.queueMaxAttempts) {
      const nextAttemptAt = new Date(now.getTime() + (input.kind === "primary" ? 30_000 : 2 * 60_000));
      if (input.kind === "primary") {
        await transaction.primaryDeliveryQueueItem.updateMany({
          where: { id: input.queueItemId, claimedBy: input.workerId },
          data: { claimedAt: null, claimedBy: null, nextAttemptAt, lastErrorCode: input.code, lastErrorMessage: message },
        });
        await transaction.delivery.update({
          where: { id: input.deliveryId },
          data: { status: DeliveryStatus.PENDING, lastErrorCode: input.code, lastErrorMessage: message },
        });
        return DeliveryStatus.PENDING;
      }
      await transaction.retryDeliveryQueueItem.updateMany({
        where: { id: input.queueItemId, claimedBy: input.workerId },
        data: { claimedAt: null, claimedBy: null, nextAttemptAt, lastErrorCode: input.code, lastErrorMessage: message },
      });
      await transaction.delivery.update({
        where: { id: input.deliveryId },
        data: { status: DeliveryStatus.RETRY_PENDING, lastErrorCode: input.code, lastErrorMessage: message },
      });
      return DeliveryStatus.RETRY_PENDING;
    }

    if (input.kind === "primary") {
      await transaction.retryDeliveryQueueItem.upsert({
        where: { deliveryId: input.deliveryId },
        create: {
          deliveryId: input.deliveryId,
          provider: input.backupProvider ?? input.provider,
          providerRoute: input.backupProviderRoute ?? input.providerRoute,
        },
        update: {},
      });
      await transaction.primaryDeliveryQueueItem.deleteMany({ where: { id: input.queueItemId, claimedBy: input.workerId } });
      await transaction.delivery.update({
        where: { id: input.deliveryId },
        data: { status: DeliveryStatus.RETRY_PENDING, lastErrorCode: input.code, lastErrorMessage: message },
      });
      return DeliveryStatus.RETRY_PENDING;
    }

    await moveToDeadLetter(transaction, input, now, message);
    return DeliveryStatus.DEAD;
  });
}

export async function transitionExhaustedQueueItem(input: {
  kind: DeliveryQueueKind;
  queueItemId: string;
  deliveryId: string;
  workerId: string;
  provider: EmailProvider;
  providerRoute: string;
  backupProvider?: EmailProvider;
  backupProviderRoute?: string;
}) {
  return prisma.$transaction(async (transaction) => {
    if (input.kind === "primary") {
      await transaction.retryDeliveryQueueItem.upsert({
        where: { deliveryId: input.deliveryId },
        create: {
          deliveryId: input.deliveryId,
          provider: input.backupProvider ?? input.provider,
          providerRoute: input.backupProviderRoute ?? input.providerRoute,
        },
        update: {},
      });
      await transaction.primaryDeliveryQueueItem.deleteMany({ where: { id: input.queueItemId, claimedBy: input.workerId } });
      await transaction.delivery.update({
        where: { id: input.deliveryId },
        data: {
          status: DeliveryStatus.RETRY_PENDING,
          lastErrorCode: "DELIVERY_PRIMARY_RETRIES_EXHAUSTED",
          lastErrorMessage: "The primary delivery attempt limit was reached.",
        },
      });
      return DeliveryStatus.RETRY_PENDING;
    }
    await moveToDeadLetter(transaction, {
      ...input,
      code: "DELIVERY_BACKUP_RETRIES_EXHAUSTED",
    }, new Date(), "The backup delivery attempt limit was reached.");
    return DeliveryStatus.DEAD;
  });
}

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function moveToDeadLetter(
  transaction: TransactionClient,
  input: {
    kind: DeliveryQueueKind;
    queueItemId: string;
    deliveryId: string;
    workerId: string;
    provider: EmailProvider;
    providerRoute: string;
    code: string;
  },
  now: Date,
  message: string,
) {
  const delivery = await transaction.delivery.findUniqueOrThrow({ where: { id: input.deliveryId } });
  await transaction.deliveryDeadLetter.upsert({
    where: { deliveryId_cycle: { deliveryId: delivery.id, cycle: delivery.retryCycle } },
    create: {
      deliveryId: delivery.id,
      cycle: delivery.retryCycle,
      failedProvider: input.provider,
      providerRoute: input.providerRoute,
      totalAttempts: delivery.attemptCount,
      lastErrorCode: input.code,
      lastErrorMessage: message,
      movedAt: now,
    },
    update: {},
  });
  if (input.kind === "primary") {
    await transaction.primaryDeliveryQueueItem.deleteMany({ where: { id: input.queueItemId, claimedBy: input.workerId } });
  } else {
    await transaction.retryDeliveryQueueItem.deleteMany({ where: { id: input.queueItemId, claimedBy: input.workerId } });
  }
  await transaction.delivery.update({
    where: { id: delivery.id },
    data: { status: DeliveryStatus.DEAD, completedAt: now, lastErrorCode: input.code, lastErrorMessage: message },
  });
}
