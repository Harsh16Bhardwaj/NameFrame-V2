import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { DeliveryStatus, EmailProvider, EventStatus, OrganizationRole } from "../src/generated/prisma/enums.ts";
import { retryDeadDeliveryForActor } from "../src/lib/delivery/manual-retry.ts";
import { recordProviderFailure, recordProviderSuccess, reserveProviderCapacity } from "../src/lib/delivery/provider-state.ts";
import { resolvePrimaryProvider } from "../src/lib/delivery/provider-routing.ts";
import { claimPrimaryDeliveryQueue, recoverStaleDeliveryClaims } from "../src/lib/delivery/queue-repository.ts";
import { createOrganizationSmtpConfigForActor } from "../src/lib/delivery/smtp-config-service.ts";
import { EmailProviderError, type EmailMessage, type ResolvedEmailRoute } from "../src/lib/delivery/types.ts";
import { runPrimaryDeliveryWorker, runRetryDeliveryWorker } from "../src/lib/delivery/worker.ts";
import { prisma } from "../src/lib/db/prisma.ts";
import { AppError } from "../src/lib/errors/app-error.ts";
import { createOrganizationForUser } from "../src/lib/organizations/service.ts";

const runId = randomUUID();
let organizationId: string | null = null;
const userIds: string[] = [];
const touchedGlobalRouteKeys = new Set<string>();
const savedEnvironment = new Map<string, string | undefined>();
const environmentKeys = [
  "SITE_SMTP_HOST", "SITE_SMTP_PORT", "SITE_SMTP_USERNAME", "SITE_SMTP_PASSWORD", "SITE_SMTP_FROM_EMAIL",
  "SITE_SMTP_FROM_NAME", "SITE_SMTP_SECURE", "RESEND_API_KEY", "RESEND_FROM_EMAIL", "RESEND_FROM_NAME",
];
for (const key of environmentKeys) savedEnvironment.set(key, process.env[key]);

async function cleanUp() {
  for (const [key, value] of savedEnvironment) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (organizationId) {
    await prisma.primaryDeliveryQueueItem.deleteMany({ where: { delivery: { event: { organizationId } } } });
    await prisma.retryDeliveryQueueItem.deleteMany({ where: { delivery: { event: { organizationId } } } });
    await prisma.deliveryAttempt.deleteMany({ where: { delivery: { event: { organizationId } } } });
    await prisma.deliveryDeadLetter.deleteMany({ where: { delivery: { event: { organizationId } } } });
    await prisma.delivery.deleteMany({ where: { event: { organizationId } } });
    await prisma.certificate.deleteMany({ where: { event: { organizationId } } });
    await prisma.certificateJob.deleteMany({ where: { event: { organizationId } } });
    await prisma.participant.deleteMany({ where: { event: { organizationId } } });
    await prisma.event.deleteMany({ where: { organizationId } });
    await prisma.emailProviderRouteState.deleteMany({ where: { organizationId } });
    await prisma.organizationSmtpConfig.deleteMany({ where: { organizationId } });
    await prisma.organizationMember.deleteMany({ where: { organizationId } });
    await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { organizationId: null } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  }
  if (touchedGlobalRouteKeys.size) {
    await prisma.emailProviderRouteState.deleteMany({ where: { routeKey: { in: [...touchedGlobalRouteKeys] } } });
  }
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

function route(
  key: string,
  provider: EmailProvider,
  send: (message: EmailMessage) => Promise<{ messageId: string }>,
  overrides: Partial<ResolvedEmailRoute> = {},
): ResolvedEmailRoute {
  return {
    key,
    provider,
    fromName: "Sprint Six",
    fromEmail: "sender@example.test",
    rateLimitPerMinute: 100,
    sendLimit: 1000,
    adapter: { send },
    ...overrides,
  };
}

const linkOnlyMessage = async (delivery: { recipientEmail: string; emailSubjectSnapshot: string; emailBodySnapshot: string; certificate: { artifactUrl: string } }, sender: { fromName: string; fromEmail: string }): Promise<EmailMessage> => ({
  to: delivery.recipientEmail,
  fromName: sender.fromName,
  fromEmail: sender.fromEmail,
  subject: delivery.emailSubjectSnapshot,
  text: `${delivery.emailBodySnapshot}\n${delivery.certificate.artifactUrl}`,
  html: `<a href="${delivery.certificate.artifactUrl}">Certificate</a>`,
  certificateUrl: delivery.certificate.artifactUrl,
});

try {
  process.env.CRON_SECRET = `s6-cron-${runId}`;
  const { POST: primaryRouteHandler } = await import("../src/app/api/internal/workers/delivery-primary/route.ts");
  const { POST: retryRouteHandler } = await import("../src/app/api/internal/workers/delivery-retry/route.ts");
  const unauthorizedPrimary = await primaryRouteHandler(new Request("http://localhost/api/internal/workers/delivery-primary", {
    method: "POST", headers: { authorization: "Bearer wrong" },
  }));
  const unauthorizedRetry = await retryRouteHandler(new Request("http://localhost/api/internal/workers/delivery-retry", {
    method: "POST", headers: { authorization: "Bearer wrong" },
  }));
  assert.equal(unauthorizedPrimary.status, 401);
  assert.equal(unauthorizedRetry.status, 401);

  const leader = await prisma.user.create({
    data: { clerkUserId: `s6_leader_${runId}`, email: `s6_leader_${runId}@example.test`, name: "Sprint Six Leader" },
  });
  userIds.push(leader.id);
  const member = await prisma.user.create({
    data: { clerkUserId: `s6_member_${runId}`, email: `s6_member_${runId}@example.test`, name: "Sprint Six Member" },
  });
  userIds.push(member.id);
  const organization = await createOrganizationForUser(leader.id, "Sprint Six Organization");
  organizationId = organization.id;
  await prisma.organizationMember.create({
    data: { organizationId: organization.id, userId: member.id, role: OrganizationRole.GROUP_MEMBER },
  });
  await prisma.user.update({ where: { id: member.id }, data: { organizationId: organization.id } });

  const smtpInput = {
    label: "Primary SMTP",
    host: "smtp.example.test",
    port: 465,
    username: "smtp-user@example.test",
    password: "app-password",
    fromName: "Certificate Team",
    fromEmail: "certificates@example.test",
    secure: true,
    sendLimit: 50,
    rateLimitPerMinute: 5,
  };
  let verified = false;
  const smtpConfig = await createOrganizationSmtpConfigForActor({
    userId: leader.id,
    organizationId: organization.id,
    role: OrganizationRole.GROUP_LEADER,
  }, smtpInput, async () => { verified = true; });
  assert.equal(verified, true);
  assert.equal("encryptedPassword" in smtpConfig, false);
  const persistedSmtp = await prisma.organizationSmtpConfig.findUniqueOrThrow({ where: { id: smtpConfig.id } });
  assert.notEqual(persistedSmtp.encryptedPassword, smtpInput.password);
  await assert.rejects(
    () => createOrganizationSmtpConfigForActor({ userId: member.id, organizationId: organization.id, role: OrganizationRole.GROUP_MEMBER }, smtpInput, async () => undefined),
    (error) => error instanceof AppError && error.code === "AUTHORIZATION_ERROR",
  );

  const orgSelection = await resolvePrimaryProvider(organization.id);
  assert.equal(orgSelection.type, "READY");
  if (orgSelection.type === "READY") {
    assert.equal(orgSelection.route.key, `org-smtp:${smtpConfig.id}`);
    await recordProviderSuccess(orgSelection.route);
  }
  assert.equal((await prisma.organizationSmtpConfig.findUniqueOrThrow({ where: { id: smtpConfig.id } })).sendCount, 1);

  process.env.SITE_SMTP_HOST = "smtp.site.example.test";
  process.env.SITE_SMTP_PORT = "465";
  process.env.SITE_SMTP_USERNAME = "site-user";
  process.env.SITE_SMTP_PASSWORD = "site-password";
  process.env.SITE_SMTP_FROM_EMAIL = "site@example.test";
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;
  await prisma.emailProviderRouteState.update({
    where: { routeKey: `org-smtp:${smtpConfig.id}` },
    data: { consecutiveFailures: 5, unhealthyUntil: new Date(Date.now() + 10 * 60_000) },
  });
  const siteSelection = await resolvePrimaryProvider(organization.id);
  touchedGlobalRouteKeys.add("site-smtp");
  assert.equal(siteSelection.type, "READY");
  if (siteSelection.type === "READY") assert.equal(siteSelection.route.key, "site-smtp");
  await prisma.organizationSmtpConfig.update({ where: { id: smtpConfig.id }, data: { active: false } });

  delete process.env.SITE_SMTP_HOST;
  delete process.env.SITE_SMTP_PORT;
  delete process.env.SITE_SMTP_USERNAME;
  delete process.env.SITE_SMTP_PASSWORD;
  delete process.env.SITE_SMTP_FROM_EMAIL;
  process.env.RESEND_API_KEY = "re_sprint_06_test_only";
  process.env.RESEND_FROM_EMAIL = "resend@example.test";
  const resendSelection = await resolvePrimaryProvider(organization.id);
  touchedGlobalRouteKeys.add("resend");
  assert.equal(resendSelection.type, "READY");
  if (resendSelection.type === "READY") assert.equal(resendSelection.route.key, "resend");

  const event = await prisma.event.create({
    data: {
      organizationId: organization.id,
      createdByUserId: leader.id,
      title: "Delivery Pipeline",
      organizationName: organization.name,
      status: EventStatus.ACTIVE,
    },
  });
  let deliveryIndex = 0;
  async function createQueuedDelivery() {
    const index = deliveryIndex++;
    const participant = await prisma.participant.create({
      data: {
        eventId: event.id,
        name: `Delivery Recipient ${index}`,
        email: `delivery-${index}-${runId}@example.test`,
        eligibleForCertificate: true,
      },
    });
    const job = await prisma.certificateJob.create({
      data: { eventId: event.id, participantId: participant.id, requestId: `delivery-${index}-${runId}`, status: "COMPLETED", completedAt: new Date() },
    });
    const certificate = await prisma.certificate.create({
      data: {
        certificateJobId: job.id,
        eventId: event.id,
        participantId: participant.id,
        verificationId: randomUUID(),
        artifactUrl: `https://assets.example.test/${participant.id}.png`,
        artifactPublicId: `sprint-06/${participant.id}`,
        artifactWidth: 1200,
        artifactHeight: 850,
        participantNameSnapshot: participant.name,
        eventTitleSnapshot: event.title,
        organizationNameSnapshot: event.organizationName,
        templateBackgroundUrlSnapshot: "https://assets.example.test/template.png",
        nameLeftSnapshot: 0.2,
        nameTopSnapshot: 0.4,
        nameRightSnapshot: 0.8,
        nameBottomSnapshot: 0.6,
        fontSizeSnapshot: 48,
        fontColorSnapshot: "#000000",
        fontWeightSnapshot: "600",
        textAlignSnapshot: "center",
        certificateHash: randomUUID().replaceAll("-", "").padEnd(64, "0"),
      },
    });
    const delivery = await prisma.delivery.create({
      data: {
        sourceCertificateJobId: job.id,
        certificateId: certificate.id,
        eventId: event.id,
        participantId: participant.id,
        recipientEmail: participant.email,
        emailSubjectSnapshot: "Your certificate",
        emailBodySnapshot: "Your certificate is ready.",
      },
    });
    await prisma.primaryDeliveryQueueItem.create({ data: { deliveryId: delivery.id } });
    return delivery;
  }

  const happy = await createQueuedDelivery();
  let acceptedText = "";
  const happyRoute = route(`test-happy-${runId}`, EmailProvider.SMTP, async (message) => {
    acceptedText = message.text;
    return { messageId: "smtp-accepted" };
  });
  const happySummary = await runPrimaryDeliveryWorker({
    workerId: `happy-${runId}`,
    resolvePrimary: async () => ({ type: "READY", route: happyRoute }),
    buildMessage: linkOnlyMessage,
    recordSuccess: async () => undefined,
    recordFailure: async () => undefined,
  });
  assert.equal(happySummary.sent, 1);
  assert.match(acceptedText, /https:\/\/assets\.example\.test/);
  assert.equal((await prisma.delivery.findUniqueOrThrow({ where: { id: happy.id } })).status, DeliveryStatus.SENT);
  assert.equal(await prisma.deliveryAttempt.count({ where: { deliveryId: happy.id } }), 1);
  assert.equal(await prisma.primaryDeliveryQueueItem.count({ where: { deliveryId: happy.id } }), 0);

  const locallyLimited = await createQueuedDelivery();
  await runPrimaryDeliveryWorker({
    workerId: `local-rate-${runId}`,
    resolvePrimary: async () => ({ type: "WAIT", nextAttemptAt: new Date(Date.now() + 60_000), code: "EMAIL_PROVIDER_RATE_LIMITED" }),
    buildMessage: linkOnlyMessage,
  });
  const locallyLimitedQueue = await prisma.primaryDeliveryQueueItem.findUniqueOrThrow({ where: { deliveryId: locallyLimited.id } });
  assert.equal(locallyLimitedQueue.attemptCount, 0);
  assert.equal(await prisma.deliveryAttempt.count({ where: { deliveryId: locallyLimited.id } }), 0);
  await prisma.primaryDeliveryQueueItem.delete({ where: { id: locallyLimitedQueue.id } });

  const bounded = await createQueuedDelivery();
  const failingPrimary = route(`test-primary-${runId}`, EmailProvider.SMTP, async () => {
    throw new EmailProviderError("EMAIL_PROVIDER_UNAVAILABLE", true, true, "Synthetic primary failure.");
  });
  const primaryOptions = {
    resolvePrimary: async () => ({ type: "READY" as const, route: failingPrimary }),
    buildMessage: linkOnlyMessage,
    recordSuccess: async () => undefined,
    recordFailure: async () => undefined,
  };
  await runPrimaryDeliveryWorker({ ...primaryOptions, workerId: `primary-1-${runId}` });
  const primaryQueue = await prisma.primaryDeliveryQueueItem.findUniqueOrThrow({ where: { deliveryId: bounded.id } });
  assert.equal(primaryQueue.attemptCount, 1);
  await prisma.primaryDeliveryQueueItem.update({ where: { id: primaryQueue.id }, data: { nextAttemptAt: new Date(Date.now() - 1_000) } });
  await runPrimaryDeliveryWorker({ ...primaryOptions, workerId: `primary-2-${runId}` });
  assert.equal(await prisma.primaryDeliveryQueueItem.count({ where: { deliveryId: bounded.id } }), 0);
  let retryQueue = await prisma.retryDeliveryQueueItem.findUniqueOrThrow({ where: { deliveryId: bounded.id } });
  assert.equal((await prisma.delivery.findUniqueOrThrow({ where: { id: bounded.id } })).status, DeliveryStatus.RETRY_PENDING);

  const failingBackup = route(`test-backup-${runId}`, EmailProvider.RESEND, async () => {
    throw new EmailProviderError("EMAIL_PROVIDER_UNAVAILABLE", true, true, "Synthetic backup failure.");
  });
  const retryOptions = {
    resolveBackup: async () => ({ type: "READY" as const, route: failingBackup }),
    buildMessage: linkOnlyMessage,
    recordSuccess: async () => undefined,
    recordFailure: async () => undefined,
  };
  await runRetryDeliveryWorker({ ...retryOptions, workerId: `backup-1-${runId}` });
  retryQueue = await prisma.retryDeliveryQueueItem.findUniqueOrThrow({ where: { deliveryId: bounded.id } });
  assert.equal(retryQueue.attemptCount, 1);
  await prisma.retryDeliveryQueueItem.update({ where: { id: retryQueue.id }, data: { nextAttemptAt: new Date(Date.now() - 1_000) } });
  await runRetryDeliveryWorker({ ...retryOptions, workerId: `backup-2-${runId}` });
  const deadDelivery = await prisma.delivery.findUniqueOrThrow({ where: { id: bounded.id } });
  assert.equal(deadDelivery.status, DeliveryStatus.DEAD);
  assert.equal(await prisma.deliveryAttempt.count({ where: { deliveryId: bounded.id } }), 4);
  const deadLetter = await prisma.deliveryDeadLetter.findUniqueOrThrow({ where: { deliveryId_cycle: { deliveryId: bounded.id, cycle: 0 } } });
  assert.equal(deadLetter.totalAttempts, 4);

  await retryDeadDeliveryForActor(bounded.id, member.id);
  const manuallyRetried = await prisma.delivery.findUniqueOrThrow({ where: { id: bounded.id } });
  assert.equal(manuallyRetried.status, DeliveryStatus.PENDING);
  assert.equal(manuallyRetried.retryCycle, 1);
  assert.ok((await prisma.deliveryDeadLetter.findUniqueOrThrow({ where: { id: deadLetter.id } })).resolvedAt);
  assert.equal(await prisma.deliveryAttempt.count({ where: { deliveryId: bounded.id } }), 4);
  assert.equal((await prisma.primaryDeliveryQueueItem.findUniqueOrThrow({ where: { deliveryId: bounded.id } })).attemptCount, 0);
  await prisma.primaryDeliveryQueueItem.delete({ where: { deliveryId: bounded.id } });

  const permanent = await createQueuedDelivery();
  const permanentRoute = route(`test-permanent-${runId}`, EmailProvider.RESEND, async () => {
    throw new EmailProviderError("EMAIL_INVALID_RECIPIENT", false, false, "Synthetic invalid recipient.");
  });
  await runPrimaryDeliveryWorker({
    workerId: `permanent-${runId}`,
    resolvePrimary: async () => ({ type: "READY", route: permanentRoute }),
    buildMessage: linkOnlyMessage,
    recordSuccess: async () => undefined,
    recordFailure: async () => undefined,
  });
  assert.equal((await prisma.delivery.findUniqueOrThrow({ where: { id: permanent.id } })).status, DeliveryStatus.DEAD);
  assert.equal(await prisma.deliveryAttempt.count({ where: { deliveryId: permanent.id } }), 1);
  assert.equal(await prisma.retryDeliveryQueueItem.count({ where: { deliveryId: permanent.id } }), 0);

  const healthRoute = route(`health-${runId}`, EmailProvider.RESEND, async () => ({ messageId: "unused" }), { rateLimitPerMinute: 10 });
  touchedGlobalRouteKeys.add(healthRoute.key);
  for (let index = 0; index < 5; index += 1) {
    assert.equal((await reserveProviderCapacity(healthRoute)).reserved, true);
    await recordProviderFailure(healthRoute);
  }
  const unhealthy = await prisma.emailProviderRouteState.findUniqueOrThrow({ where: { routeKey: healthRoute.key } });
  assert.equal(unhealthy.consecutiveFailures, 5);
  assert.ok(unhealthy.unhealthyUntil && unhealthy.unhealthyUntil > new Date());
  assert.equal((await reserveProviderCapacity(healthRoute)).reserved, false);
  await prisma.emailProviderRouteState.update({ where: { routeKey: healthRoute.key }, data: { unhealthyUntil: new Date(Date.now() - 1_000) } });
  assert.equal((await reserveProviderCapacity(healthRoute)).reserved, true);
  await recordProviderSuccess(healthRoute);
  assert.equal((await prisma.emailProviderRouteState.findUniqueOrThrow({ where: { routeKey: healthRoute.key } })).consecutiveFailures, 0);

  const rateRoute = route(`rate-${runId}`, EmailProvider.RESEND, async () => ({ messageId: "unused" }), { rateLimitPerMinute: 1 });
  touchedGlobalRouteKeys.add(rateRoute.key);
  assert.equal((await reserveProviderCapacity(rateRoute)).reserved, true);
  const rateWait = await reserveProviderCapacity(rateRoute);
  assert.equal(rateWait.reserved, false);
  if (!rateWait.reserved) assert.equal(rateWait.reason, "EMAIL_PROVIDER_RATE_LIMITED");

  const limitRoute = route(`limit-${runId}`, EmailProvider.SMTP, async () => ({ messageId: "unused" }), { sendLimit: 1 });
  touchedGlobalRouteKeys.add(limitRoute.key);
  assert.equal((await reserveProviderCapacity(limitRoute)).reserved, true);
  await recordProviderSuccess(limitRoute);
  const limitWait = await reserveProviderCapacity(limitRoute);
  assert.equal(limitWait.reserved, false);
  if (!limitWait.reserved) assert.equal(limitWait.reason, "SMTP_LIMIT_REACHED");

  const claimDeliveries = await Promise.all(Array.from({ length: 12 }, () => createQueuedDelivery()));
  const [claimsA, claimsB] = await Promise.all([
    claimPrimaryDeliveryQueue(`claim-a-${runId}`),
    claimPrimaryDeliveryQueue(`claim-b-${runId}`),
  ]);
  assert.ok(claimsA.length <= 5 && claimsB.length <= 5);
  assert.equal(claimsA.length + claimsB.length, 10);
  assert.equal(new Set([...claimsA, ...claimsB].map((item) => item.id)).size, 10);
  const stale = claimsA[0];
  assert.ok(stale);
  await prisma.primaryDeliveryQueueItem.update({ where: { id: stale.id }, data: { claimedAt: new Date(Date.now() - 6 * 60_000) } });
  const recovered = await recoverStaleDeliveryClaims();
  assert.ok(recovered.primary >= 1);
  const recoveredItem = await prisma.primaryDeliveryQueueItem.findUniqueOrThrow({ where: { id: stale.id } });
  assert.equal(recoveredItem.claimedBy, null);
  assert.equal(recoveredItem.attemptCount, 0);
  assert.equal(await prisma.primaryDeliveryQueueItem.count({ where: { deliveryId: { in: claimDeliveries.map((delivery) => delivery.id) } } }), 12);

  console.log("Sprint 06 SMTP safety, provider routing, queues, bounded retries, DLQ, manual retry, health, rate limits, concurrency, and stale recovery checks passed.");
} finally {
  await cleanUp();
  await prisma.$disconnect();
}
