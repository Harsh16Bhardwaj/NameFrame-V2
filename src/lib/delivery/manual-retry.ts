import { DeliveryStatus } from "@/generated/prisma/enums";
import { getOrganizationActor } from "@/lib/auth/authorization";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors/app-error";

export async function retryDeadDelivery(deliveryId: string) {
  const actor = await getOrganizationActor();
  const delivery = await prisma.delivery.findFirst({
    where: { id: deliveryId, deletedAt: null, event: { organizationId: actor.organizationId } },
  });
  if (!delivery) throw new AppError("DELIVERY_NOT_FOUND", "Delivery not found.");
  return retryDeadDeliveryForActor(delivery.id, actor.userId);
}

export async function retryDeadDeliveryForActor(deliveryId: string, userId: string) {
  return prisma.$transaction(async (transaction) => {
    const delivery = await transaction.delivery.findFirst({ where: { id: deliveryId, deletedAt: null } });
    if (!delivery) throw new AppError("DELIVERY_NOT_FOUND", "Delivery not found.");
    if (delivery.status !== DeliveryStatus.DEAD) throw new AppError("DELIVERY_NOT_RETRYABLE", "Only dead deliveries can be retried.");
    const deadLetter = await transaction.deliveryDeadLetter.findFirst({
      where: { deliveryId, resolvedAt: null },
      orderBy: { movedAt: "desc" },
    });
    if (!deadLetter) throw new AppError("DELIVERY_NOT_RETRYABLE", "The delivery has no active dead-letter entry.");

    const now = new Date();
    await transaction.deliveryDeadLetter.update({
      where: { id: deadLetter.id },
      data: { resolvedAt: now, resolvedByUserId: userId },
    });
    await transaction.retryDeliveryQueueItem.deleteMany({ where: { deliveryId } });
    await transaction.primaryDeliveryQueueItem.upsert({
      where: { deliveryId },
      create: { deliveryId },
      update: {
        provider: null,
        providerRoute: null,
        attemptCount: 0,
        nextAttemptAt: now,
        claimedAt: null,
        claimedBy: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    return transaction.delivery.update({
      where: { id: deliveryId },
      data: {
        status: DeliveryStatus.PENDING,
        retryCycle: { increment: 1 },
        startedAt: null,
        completedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
  });
}
