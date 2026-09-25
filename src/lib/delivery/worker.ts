import { randomUUID } from "node:crypto";

import { EmailProvider, DeliveryStatus } from "@/generated/prisma/enums";
import { buildDeliveryMessage } from "@/lib/delivery/message";
import { recordProviderFailure, recordProviderSuccess } from "@/lib/delivery/provider-state";
import { resolveBackupProvider, resolvePrimaryProvider } from "@/lib/delivery/provider-routing";
import {
  beginDeliveryAttempt,
  claimPrimaryDeliveryQueue,
  claimRetryDeliveryQueue,
  completeDeliveryAttempt,
  failDeliveryAttempt,
  loadDeliveryForProcessing,
  recoverStaleDeliveryClaims,
  releaseDeliveryClaim,
  transitionExhaustedQueueItem,
  type DeliveryQueueKind,
} from "@/lib/delivery/queue-repository";
import { EmailProviderError, type ProviderSelection, type ResolvedEmailRoute } from "@/lib/delivery/types";

type WorkerDependencies = {
  resolvePrimary?: (organizationId: string, now?: Date) => Promise<ProviderSelection>;
  resolveBackup?: (organizationId: string, primaryRouteKey: string | null, now?: Date) => Promise<ProviderSelection>;
  buildMessage?: typeof buildDeliveryMessage;
  recordSuccess?: typeof recordProviderSuccess;
  recordFailure?: typeof recordProviderFailure;
};

type WorkerOptions = WorkerDependencies & { workerId?: string; now?: Date; deliveryIds?: string[]; recoverStale?: boolean };

export async function runPrimaryDeliveryWorker(options: WorkerOptions = {}) {
  return runDeliveryWorker("primary", options);
}

export async function runRetryDeliveryWorker(options: WorkerOptions = {}) {
  return runDeliveryWorker("retry", options);
}

async function runDeliveryWorker(kind: DeliveryQueueKind, options: WorkerOptions) {
  const workerId = options.workerId ?? randomUUID();
  const now = options.now ?? new Date();
  const recovery = options.recoverStale === false ? { primary: 0, retry: 0 } : await recoverStaleDeliveryClaims(now);
  const claimed = kind === "primary"
    ? await claimPrimaryDeliveryQueue(workerId, now, options.deliveryIds)
    : await claimRetryDeliveryQueue(workerId, now, options.deliveryIds);
  const summary = { workerId, queue: kind, claimed: claimed.length, sent: 0, rescheduled: 0, promoted: 0, dead: 0, claimedItemIds: claimed.map((item) => item.id), recovery, startedAt: now.toISOString(), completedAt: "", durationMs: 0 };

  for (const item of claimed) {
    const startedAt = new Date();
    try {
    const delivery = await loadDeliveryForProcessing(item.deliveryId);
    if (!delivery) {
      await releaseDeliveryClaim(kind, item.id, workerId, new Date(Date.now() + 60_000), "DELIVERY_NOT_FOUND");
      summary.rescheduled += 1;
      continue;
    }

    if (item.attemptCount >= item.maxAttempts) {
      const currentProvider = item.provider ?? EmailProvider.RESEND;
      const currentRoute = item.providerRoute ?? "resend";
      const backup = process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL
        ? { provider: EmailProvider.RESEND, route: "resend" }
        : { provider: currentProvider, route: currentRoute };
      const exhaustedStatus = await transitionExhaustedQueueItem({
        kind,
        queueItemId: item.id,
        deliveryId: delivery.id,
        workerId,
        provider: currentProvider,
        providerRoute: currentRoute,
        backupProvider: backup.provider,
        backupProviderRoute: backup.route,
      });
      if (exhaustedStatus === DeliveryStatus.DEAD) summary.dead += 1;
      else summary.promoted += 1;
      continue;
    }

    const selection = kind === "primary"
      ? await (options.resolvePrimary ?? resolvePrimaryProvider)(delivery.event.organizationId, now)
      : await (options.resolveBackup ?? resolveBackupProvider)(delivery.event.organizationId, "providerRoute" in item ? item.providerRoute : null, now);
    if (selection.type === "WAIT") {
      await releaseDeliveryClaim(kind, item.id, workerId, selection.nextAttemptAt, selection.code);
      summary.rescheduled += 1;
      logDeliveryAttempt({ kind, workerId, delivery, item, startedAt, result: "waiting", errorCode: selection.code });
      continue;
    }

    const route = selection.route;
    const message = await (options.buildMessage ?? buildDeliveryMessage)(delivery, route);
    let attempt;
    try {
      attempt = await beginDeliveryAttempt({
        kind,
        queueItemId: item.id,
        deliveryId: delivery.id,
        workerId,
        provider: route.provider,
        providerRoute: route.key,
      });
      const result = await route.adapter.send(message, { idempotencyKey: `delivery-${delivery.id}-attempt-${attempt.attempt.attemptNumber}` });
      await completeDeliveryAttempt({
        kind,
        queueItemId: item.id,
        deliveryId: delivery.id,
        attemptId: attempt.attempt.id,
        workerId,
        providerMessageId: result.messageId,
      });
      await (options.recordSuccess ?? recordProviderSuccess)(route).catch((error) => {
        console.error("Provider success state update failed", { routeKey: route.key, deliveryId: delivery.id, error });
      });
      summary.sent += 1;
      logDeliveryAttempt({ kind, workerId, delivery, item, route, startedAt, result: "sent", newStatus: DeliveryStatus.SENT, attemptNumber: attempt.attempt.attemptNumber });
    } catch (error) {
      const failure = normalizeProviderFailure(error);
      if (failure.providerFailure) {
        await (options.recordFailure ?? recordProviderFailure)(route).catch((stateError) => {
          console.error("Provider failure state update failed", { routeKey: route.key, deliveryId: delivery.id, error: stateError });
        });
      }
      if (!attempt) {
        await releaseDeliveryClaim(kind, item.id, workerId, new Date(Date.now() + 60_000), failure.code);
        summary.rescheduled += 1;
        continue;
      }
      const backup = backupIdentity(route);
      const newStatus = await failDeliveryAttempt({
        kind,
        queueItemId: item.id,
        deliveryId: delivery.id,
        attemptId: attempt.attempt.id,
        workerId,
        queueAttemptCount: item.attemptCount + 1,
        queueMaxAttempts: item.maxAttempts,
        provider: route.provider,
        providerRoute: route.key,
        retryable: failure.retryable,
        code: failure.code,
        message: failure.message,
        backupProvider: backup.provider,
        backupProviderRoute: backup.route,
      });
      if (newStatus === DeliveryStatus.DEAD) summary.dead += 1;
      else if (kind === "primary" && item.attemptCount + 1 >= item.maxAttempts) summary.promoted += 1;
      else summary.rescheduled += 1;
      logDeliveryAttempt({
        kind,
        workerId,
        delivery,
        item,
        route,
        startedAt,
        result: "failed",
        newStatus,
        errorCode: failure.code,
        attemptNumber: attempt.attempt.attemptNumber,
      });
    }
    } catch (error) {
      console.error("Delivery queue item failed independently", {
        workerId,
        queue: kind,
        queueItemId: item.id,
        deliveryId: item.deliveryId,
        error,
      });
      await releaseDeliveryClaim(kind, item.id, workerId, new Date(Date.now() + 60_000), "DELIVERY_PROCESSING_FAILED").catch(() => undefined);
      summary.rescheduled += 1;
    }
  }
  const completedAt = new Date();
  summary.completedAt = completedAt.toISOString();
  summary.durationMs = completedAt.getTime() - now.getTime();
  return summary;
}

function normalizeProviderFailure(error: unknown): EmailProviderError {
  if (error instanceof EmailProviderError) return error;
  return new EmailProviderError("EMAIL_SEND_FAILED", true, true, "Email sending failed unexpectedly.", { cause: error });
}

function backupIdentity(primary: ResolvedEmailRoute) {
  if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
    return { provider: EmailProvider.RESEND, route: "resend" };
  }
  return { provider: primary.provider, route: primary.key };
}

function logDeliveryAttempt(input: {
  kind: DeliveryQueueKind;
  workerId: string;
  delivery: { id: string; certificateId: string; eventId: string; event: { organizationId: string } };
  item: { attemptCount: number };
  route?: ResolvedEmailRoute;
  startedAt: Date;
  result: string;
  newStatus?: DeliveryStatus;
  errorCode?: string;
  attemptNumber?: number;
}) {
  const completedAt = new Date();
  console.info("Delivery worker attempt", {
    workerId: input.workerId,
    deliveryId: input.delivery.id,
    certificateId: input.delivery.certificateId,
    eventId: input.delivery.eventId,
    organizationId: input.delivery.event.organizationId,
    queue: input.kind,
    provider: input.route?.provider,
    providerRoute: input.route?.key,
    attemptNumber: input.attemptNumber,
    previousStatus: input.kind === "primary" ? DeliveryStatus.PENDING : DeliveryStatus.RETRY_PENDING,
    newStatus: input.newStatus,
    durationMs: completedAt.getTime() - input.startedAt.getTime(),
    result: input.result,
    errorCode: input.errorCode,
  });
}
