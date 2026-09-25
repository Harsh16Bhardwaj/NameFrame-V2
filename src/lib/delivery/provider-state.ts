import { prisma } from "@/lib/db/prisma";
import type { ResolvedEmailRoute } from "@/lib/delivery/types";

const RATE_WINDOW_MS = 60_000;
const PROVIDER_COOLDOWN_MS = 10 * 60_000;
const UNHEALTHY_FAILURE_COUNT = 5;

export async function reserveProviderCapacity(route: ResolvedEmailRoute, now = new Date()) {
  return prisma.$transaction(async (transaction) => {
    await transaction.emailProviderRouteState.upsert({
      where: { routeKey: route.key },
      create: {
        routeKey: route.key,
        provider: route.provider,
        organizationId: route.organizationId,
        sendLimit: route.sendLimit,
        rateLimitPerMinute: route.rateLimitPerMinute,
        windowStartedAt: now,
      },
      update: { sendLimit: route.sendLimit, rateLimitPerMinute: route.rateLimitPerMinute },
    });
    await transaction.$queryRaw`SELECT "id" FROM "sertify"."EmailProviderRouteState" WHERE "routeKey" = ${route.key} FOR UPDATE`;
    const state = await transaction.emailProviderRouteState.findUniqueOrThrow({ where: { routeKey: route.key } });

    if (state.unhealthyUntil && state.unhealthyUntil > now) {
      return { reserved: false as const, nextAttemptAt: state.unhealthyUntil, reason: "EMAIL_PROVIDER_UNAVAILABLE" };
    }
    if (state.sendCount >= route.sendLimit) {
      return { reserved: false as const, nextAttemptAt: new Date(now.getTime() + RATE_WINDOW_MS), reason: "SMTP_LIMIT_REACHED" };
    }

    const windowExpired = now.getTime() - state.windowStartedAt.getTime() >= RATE_WINDOW_MS;
    const windowStartedAt = windowExpired ? now : state.windowStartedAt;
    const windowSendCount = windowExpired ? 0 : state.windowSendCount;
    if (windowSendCount >= route.rateLimitPerMinute) {
      return {
        reserved: false as const,
        nextAttemptAt: new Date(windowStartedAt.getTime() + RATE_WINDOW_MS),
        reason: "EMAIL_PROVIDER_RATE_LIMITED",
      };
    }

    await transaction.emailProviderRouteState.update({
      where: { routeKey: route.key },
      data: { windowStartedAt, windowSendCount: windowSendCount + 1 },
    });
    return { reserved: true as const };
  });
}

export async function recordProviderSuccess(route: ResolvedEmailRoute) {
  await prisma.$transaction(async (transaction) => {
    await transaction.emailProviderRouteState.update({
      where: { routeKey: route.key },
      data: { consecutiveFailures: 0, unhealthyUntil: null, sendCount: { increment: 1 } },
    });
    if (route.organizationSmtpConfigId) {
      await transaction.organizationSmtpConfig.updateMany({
        where: { id: route.organizationSmtpConfigId, active: true, deletedAt: null },
        data: { sendCount: { increment: 1 } },
      });
    }
  });
}

export async function recordProviderFailure(route: ResolvedEmailRoute, now = new Date()) {
  await prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT "id" FROM "sertify"."EmailProviderRouteState" WHERE "routeKey" = ${route.key} FOR UPDATE`;
    const state = await transaction.emailProviderRouteState.findUniqueOrThrow({ where: { routeKey: route.key } });
    const consecutiveFailures = state.consecutiveFailures + 1;
    await transaction.emailProviderRouteState.update({
      where: { routeKey: route.key },
      data: {
        consecutiveFailures,
        unhealthyUntil: consecutiveFailures >= UNHEALTHY_FAILURE_COUNT
          ? new Date(now.getTime() + PROVIDER_COOLDOWN_MS)
          : null,
      },
    });
  });
}
