import "server-only";

import {
  CertificateJobStatus,
  DeliveryStatus,
  EventStatus,
} from "@/generated/prisma/enums";
import { getOrganizationActor, requireEventAccess } from "@/lib/auth/authorization";
import { prisma } from "@/lib/db/prisma";
import { deliveryQueueLabel, deriveProviderLabel } from "@/lib/dashboard/presentation";
import { AppError } from "@/lib/errors/app-error";
import { deriveBulkStatusFromJobs } from "@/lib/jobs/bulk-operation";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;

export type DashboardListInput = {
  page?: unknown;
  pageSize?: unknown;
  search?: unknown;
  status?: unknown;
  queue?: unknown;
  provider?: unknown;
};

function pageInput(input: DashboardListInput) {
  const page = integer(input.page, 1, 1, 100_000);
  const pageSize = integer(input.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const search = typeof input.search === "string" ? input.search.trim().slice(0, 200) : "";
  return { page, pageSize, skip: (page - 1) * pageSize, search };
}

function integer(value: unknown, fallback: number, min: number, max: number) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new AppError("VALIDATION_ERROR", `Pagination values must be integers from ${min} to ${max}.`);
  }
  return parsed;
}

function enumValue<T extends string>(value: unknown, values: readonly T[], field: string): T | undefined {
  if (value === undefined || value === null || value === "" || value === "ALL") return undefined;
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new AppError("VALIDATION_ERROR", `${field} filter is invalid.`);
  }
  return value as T;
}

export async function getOrganizationDashboard() {
  const actor = await getOrganizationActor();
  return getOrganizationDashboardForOrganization(actor.organizationId);
}

export async function getOrganizationDashboardForOrganization(organizationId: string) {
  const eventWhere = { organizationId, deletedAt: null } as const;
  const participantWhere = { deletedAt: null, event: eventWhere } as const;
  const deliveryWhere = { deletedAt: null, event: eventWhere } as const;
  const [organization, eventGroups, participants, uniqueParticipantRows, eligibleParticipants, issuedCertificates, deliveryGroups, retryQueueCount, deadLetterCount, recentEvents, activity] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true, logoUrl: true } }),
    prisma.event.groupBy({ by: ["status"], where: eventWhere, _count: { _all: true } }),
    prisma.participant.count({ where: participantWhere }),
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT LOWER(p."email")) AS count
      FROM "sertify"."Participant" AS p
      INNER JOIN "sertify"."Event" AS e ON e."id" = p."eventId"
      WHERE e."organizationId" = ${organizationId}
        AND e."deletedAt" IS NULL
        AND p."deletedAt" IS NULL
    `,
    prisma.participant.count({ where: { ...participantWhere, eligibleForCertificate: true } }),
    prisma.certificate.count({ where: { event: eventWhere } }),
    prisma.delivery.groupBy({ by: ["status"], where: deliveryWhere, _count: { _all: true } }),
    prisma.retryDeliveryQueueItem.count({ where: { delivery: deliveryWhere } }),
    prisma.deliveryDeadLetter.count({ where: { resolvedAt: null, delivery: deliveryWhere } }),
    prisma.event.findMany({
      where: eventWhere,
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: {
        id: true, title: true, status: true, updatedAt: true,
        _count: { select: { participants: { where: { deletedAt: null } }, certificates: true, deliveries: true } },
      },
    }),
    getRecentActivityForOrganization(organizationId),
  ]);
  if (!organization) throw new AppError("NOT_FOUND", "Organization not found.");
  const eventCount = (status: EventStatus) => eventGroups.find((group) => group.status === status)?._count._all ?? 0;
  const deliveryCount = (status: DeliveryStatus) => deliveryGroups.find((group) => group.status === status)?._count._all ?? 0;
  return {
    organization,
    metrics: {
      totalEvents: eventGroups.reduce((sum, group) => sum + group._count._all, 0),
      activeEvents: eventCount(EventStatus.ACTIVE),
      completedEvents: eventCount(EventStatus.COMPLETED),
      draftEvents: eventCount(EventStatus.DRAFT),
      totalParticipants: participants,
      uniqueParticipants: Number(uniqueParticipantRows[0]?.count ?? 0),
      eligibleParticipants,
      issuedCertificates,
      pendingDeliveries: deliveryCount(DeliveryStatus.PENDING) + deliveryCount(DeliveryStatus.PROCESSING) + deliveryCount(DeliveryStatus.RETRY_PENDING),
      sentDeliveries: deliveryCount(DeliveryStatus.SENT),
      deadDeliveries: deliveryCount(DeliveryStatus.DEAD),
      retryQueueCount,
      deadLetterCount,
    },
    recentEvents,
    activity,
  };
}

export async function getEventDashboard(eventId: string) {
  await requireEventAccess(eventId);
  return getEventDashboardForEvent(eventId);
}

export async function getEventDashboardForEvent(eventId: string) {
  const event = await prisma.event.findFirst({ where: { id: eventId, deletedAt: null }, select: { id: true, title: true, status: true } });
  if (!event) throw new AppError("EVENT_NOT_FOUND", "Event not found.");
  const [participants, eligible, certificates, jobGroups, deliveryGroups, bulkOperations] = await Promise.all([
    prisma.participant.count({ where: { eventId, deletedAt: null } }),
    prisma.participant.count({ where: { eventId, deletedAt: null, eligibleForCertificate: true } }),
    prisma.certificate.count({ where: { eventId } }),
    prisma.certificateJob.groupBy({ by: ["status"], where: { eventId, deletedAt: null }, _count: { _all: true } }),
    prisma.delivery.groupBy({ by: ["status"], where: { eventId, deletedAt: null }, _count: { _all: true } }),
    prisma.bulkOperation.count({ where: { eventId, deletedAt: null } }),
  ]);
  const jobs = (status: CertificateJobStatus) => jobGroups.find((group) => group.status === status)?._count._all ?? 0;
  const deliveries = (status: DeliveryStatus) => deliveryGroups.find((group) => group.status === status)?._count._all ?? 0;
  return {
    event,
    metrics: {
      participants,
      eligibleParticipants: eligible,
      ineligibleParticipants: participants - eligible,
      issuedCertificates: certificates,
      certificateJobs: {
        pending: jobs(CertificateJobStatus.PENDING), processing: jobs(CertificateJobStatus.PROCESSING),
        retrying: jobs(CertificateJobStatus.RETRY_PENDING), completed: jobs(CertificateJobStatus.COMPLETED), dead: jobs(CertificateJobStatus.DEAD),
      },
      deliveries: {
        pending: deliveries(DeliveryStatus.PENDING), processing: deliveries(DeliveryStatus.PROCESSING),
        retrying: deliveries(DeliveryStatus.RETRY_PENDING), sent: deliveries(DeliveryStatus.SENT), dead: deliveries(DeliveryStatus.DEAD),
      },
      bulkOperations,
    },
  };
}

export async function getBulkOperations(eventId: string, input: DashboardListInput = {}) {
  await requireEventAccess(eventId);
  return getBulkOperationsForEvent(eventId, input);
}

export async function getBulkOperationsForEvent(eventId: string, input: DashboardListInput = {}) {
  const { page, pageSize, skip } = pageInput(input);
  const where = { eventId, deletedAt: null } as const;
  const [total, operations] = await Promise.all([
    prisma.bulkOperation.count({ where }),
    prisma.bulkOperation.findMany({
      where, skip, take: pageSize, orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, startedAt: true, completedAt: true, requestedBy: { select: { name: true, email: true } } },
    }),
  ]);
  const ids = operations.map((operation) => operation.id);
  const groups = ids.length ? await prisma.certificateJob.groupBy({
    by: ["bulkOperationId", "status"], where: { bulkOperationId: { in: ids }, deletedAt: null }, _count: { _all: true },
  }) : [];
  const data = operations.map((operation) => {
    const count = (status: CertificateJobStatus) => groups.find((group) => group.bulkOperationId === operation.id && group.status === status)?._count._all ?? 0;
    const completed = count(CertificateJobStatus.COMPLETED);
    const dead = count(CertificateJobStatus.DEAD);
    const processing = count(CertificateJobStatus.PROCESSING);
    const pending = count(CertificateJobStatus.PENDING) + count(CertificateJobStatus.RETRY_PENDING);
    const totalJobs = completed + dead + processing + pending;
    return { ...operation, totalJobs, completed, dead, processing, pending, status: deriveBulkStatusFromJobs({ total: totalJobs, completed, dead, processing, pending }) };
  });
  return paginated(data, total, page, pageSize);
}

export async function getCertificateJobs(eventId: string, input: DashboardListInput = {}) {
  await requireEventAccess(eventId);
  return getCertificateJobsForEvent(eventId, input);
}

export async function getCertificateJobsForEvent(eventId: string, input: DashboardListInput = {}) {
  const { page, pageSize, skip, search } = pageInput(input);
  const status = enumValue(input.status, Object.values(CertificateJobStatus), "Certificate job status");
  const where = {
    eventId, deletedAt: null, ...(status ? { status } : {}),
    ...(search ? { participant: { is: { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { email: { contains: search, mode: "insensitive" as const } }] } } } : {}),
  };
  const [total, data] = await Promise.all([
    prisma.certificateJob.count({ where }),
    prisma.certificateJob.findMany({
      where, skip, take: pageSize, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true, status: true, attemptCount: true, maxAttempts: true, createdAt: true, startedAt: true, completedAt: true,
        updatedAt: true, lastErrorCode: true, lastErrorMessage: true, bulkOperationId: true,
        participant: { select: { id: true, name: true, email: true, eligibleForCertificate: true } },
        certificate: { select: { artifactUrl: true } },
      },
    }),
  ]);
  return paginated(data, total, page, pageSize);
}

export async function getCertificateJob(jobId: string) {
  const actor = await getOrganizationActor();
  const job = await prisma.certificateJob.findFirst({
    where: { id: jobId, deletedAt: null, event: { organizationId: actor.organizationId, deletedAt: null } },
    select: {
      id: true, status: true, attemptCount: true, maxAttempts: true, createdAt: true, startedAt: true, completedAt: true,
      updatedAt: true, lastErrorCode: true, lastErrorMessage: true,
      participant: { select: { id: true, name: true, email: true, eligibleForCertificate: true } },
      event: { select: { id: true, title: true, status: true } },
      bulkOperation: { select: { id: true, createdAt: true } },
    },
  });
  if (!job) throw new AppError("NOT_FOUND", "Certificate job not found.");
  return job;
}

export async function getDeliveries(eventId: string, input: DashboardListInput = {}) {
  await requireEventAccess(eventId);
  return getDeliveriesForEvent(eventId, input);
}

export async function getDeliveriesForEvent(eventId: string, input: DashboardListInput = {}) {
  const { page, pageSize, skip, search } = pageInput(input);
  const status = enumValue(input.status, Object.values(DeliveryStatus), "Delivery status");
  const queue = enumValue(input.queue, ["PRIMARY", "RETRY", "DEAD", "COMPLETED"] as const, "Delivery queue");
  const provider = enumValue(input.provider, ["SMTP", "RESEND", "SENDGRID"] as const, "Provider");
  const queueWhere = queue === "PRIMARY" ? { primaryQueue: { isNot: null } }
    : queue === "RETRY" ? { retryQueue: { isNot: null } }
      : queue === "DEAD" ? { deadLetters: { some: { resolvedAt: null } } }
        : queue === "COMPLETED" ? { status: DeliveryStatus.SENT } : {};
  const where = {
    eventId, deletedAt: null, ...queueWhere, ...(status ? { status } : {}),
    ...(provider ? { attempts: { some: { provider, deletedAt: null } } } : {}),
    ...(search ? { participant: { is: { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { email: { contains: search, mode: "insensitive" as const } }] } } } : {}),
  };
  const select = {
    id: true, recipientEmail: true, status: true, attemptCount: true, createdAt: true, completedAt: true,
    lastErrorCode: true, lastErrorMessage: true,
    participant: { select: { id: true, name: true, email: true } },
    certificate: { select: { id: true, verificationId: true, artifactUrl: true } },
    primaryQueue: { select: { nextAttemptAt: true, attemptCount: true, lastErrorCode: true, lastErrorMessage: true } },
    retryQueue: { select: { provider: true, providerRoute: true, nextAttemptAt: true, attemptCount: true, lastErrorCode: true, lastErrorMessage: true } },
    deadLetters: { where: { resolvedAt: null }, select: { id: true, failedProvider: true, movedAt: true } },
    attempts: { where: { deletedAt: null }, orderBy: { attemptNumber: "desc" as const }, take: 1, select: { provider: true, providerRoute: true } },
  } as const;
  const [total, rows] = await Promise.all([
    prisma.delivery.count({ where }),
    prisma.delivery.findMany({ where, skip, take: pageSize, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select }),
  ]);
  const data = rows.map((row) => ({
    ...row,
    currentQueue: deliveryQueueLabel({ status: row.status, hasPrimaryQueue: Boolean(row.primaryQueue), hasRetryQueue: Boolean(row.retryQueue), hasOpenDeadLetter: row.deadLetters.length > 0 }),
    latestProvider: row.attempts[0]?.providerRoute ?? row.attempts[0]?.provider ?? null,
  }));
  return paginated(data, total, page, pageSize);
}

export async function getDelivery(deliveryId: string) {
  const actor = await getOrganizationActor();
  const delivery = await prisma.delivery.findFirst({
    where: { id: deliveryId, deletedAt: null, event: { organizationId: actor.organizationId, deletedAt: null } },
    select: {
      id: true, status: true, recipientEmail: true, attemptCount: true, maxAttempts: true, retryCycle: true, createdAt: true,
      startedAt: true, completedAt: true, lastErrorCode: true, lastErrorMessage: true,
      participant: { select: { id: true, name: true, email: true } }, event: { select: { id: true, title: true } },
      certificate: { select: { id: true, verificationId: true, artifactUrl: true } },
      primaryQueue: { select: { nextAttemptAt: true, attemptCount: true, lastErrorCode: true, lastErrorMessage: true } },
      retryQueue: { select: { provider: true, providerRoute: true, nextAttemptAt: true, attemptCount: true, lastErrorCode: true, lastErrorMessage: true } },
      attempts: { where: { deletedAt: null }, orderBy: { attemptNumber: "asc" }, select: { id: true, attemptNumber: true, provider: true, providerRoute: true, startedAt: true, completedAt: true, providerMessageId: true, errorCode: true, errorMessage: true } },
      deadLetters: { orderBy: { movedAt: "desc" }, select: { id: true, cycle: true, failedProvider: true, providerRoute: true, totalAttempts: true, lastErrorCode: true, lastErrorMessage: true, movedAt: true, resolvedAt: true } },
    },
  });
  if (!delivery) throw new AppError("DELIVERY_NOT_FOUND", "Delivery not found.");
  return { ...delivery, currentQueue: deliveryQueueLabel({ status: delivery.status, hasPrimaryQueue: Boolean(delivery.primaryQueue), hasRetryQueue: Boolean(delivery.retryQueue), hasOpenDeadLetter: delivery.deadLetters.some((entry) => !entry.resolvedAt) }) };
}

export async function getProviderStatus() {
  const actor = await getOrganizationActor();
  return getProviderStatusForOrganization(actor.organizationId);
}

export async function getProviderStatusForOrganization(organizationId: string, now = new Date()) {
  const [smtp, states] = await Promise.all([
    prisma.organizationSmtpConfig.findFirst({
      where: { organizationId, active: true, deletedAt: null }, orderBy: { updatedAt: "desc" },
      select: { id: true, label: true, active: true, sendCount: true, sendLimit: true, rateLimitPerMinute: true },
    }),
    prisma.emailProviderRouteState.findMany({
      where: { OR: [{ organizationId }, { routeKey: { in: ["site-smtp", "resend"] } }] },
      select: { routeKey: true, consecutiveFailures: true, unhealthyUntil: true, sendCount: true, sendLimit: true, rateLimitPerMinute: true, windowStartedAt: true, windowSendCount: true, updatedAt: true },
    }),
  ]);
  const entries = [
    providerEntry("Organization SMTP", smtp ? `org-smtp:${smtp.id}` : null, Boolean(smtp), states, now, smtp ?? undefined),
    providerEntry("Site SMTP", "site-smtp", Boolean(process.env.SITE_SMTP_HOST && process.env.SITE_SMTP_USERNAME && process.env.SITE_SMTP_PASSWORD && process.env.SITE_SMTP_FROM_EMAIL), states, now),
    providerEntry("Resend", "resend", Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL), states, now),
  ];
  return { providers: entries };
}

type ProviderStateSnapshot = {
  routeKey: string;
  consecutiveFailures: number;
  unhealthyUntil: Date | null;
  sendCount: number;
  sendLimit: number;
  rateLimitPerMinute: number;
  windowStartedAt: Date;
  windowSendCount: number;
  updatedAt: Date;
};

function providerEntry(label: string, routeKey: string | null, configured: boolean, states: ProviderStateSnapshot[], now: Date, smtp?: { label: string; active: boolean; sendCount: number; sendLimit: number; rateLimitPerMinute: number }) {
  const state = routeKey ? states.find((item) => item.routeKey === routeKey) : undefined;
  const values = {
    configured, consecutiveFailures: state?.consecutiveFailures ?? 0, unhealthyUntil: state?.unhealthyUntil ?? null,
    lastCheckedAt: state?.updatedAt ?? null, sendCount: smtp?.sendCount ?? state?.sendCount ?? 0,
    sendLimit: smtp?.sendLimit ?? state?.sendLimit ?? 1_000_000,
    rateLimitPerMinute: smtp?.rateLimitPerMinute ?? state?.rateLimitPerMinute ?? 60,
    windowStartedAt: state?.windowStartedAt ?? null, windowSendCount: state?.windowSendCount ?? 0,
  };
  return { label, routeKey, ...values, status: deriveProviderLabel(values, now), smtpLabel: smtp?.label ?? null, active: smtp?.active ?? configured };
}

async function getRecentActivityForOrganization(organizationId: string) {
  const eventScope = { organizationId, deletedAt: null } as const;
  const [operations, jobs, deliveries] = await Promise.all([
    prisma.bulkOperation.findMany({ where: { deletedAt: null, event: eventScope }, orderBy: { updatedAt: "desc" }, take: 5, select: { id: true, status: true, updatedAt: true, event: { select: { id: true, title: true } } } }),
    prisma.certificateJob.findMany({ where: { deletedAt: null, status: CertificateJobStatus.DEAD, event: eventScope }, orderBy: { updatedAt: "desc" }, take: 5, select: { id: true, updatedAt: true, lastErrorCode: true, event: { select: { id: true, title: true } }, participant: { select: { name: true } } } }),
    prisma.delivery.findMany({ where: { deletedAt: null, status: { in: [DeliveryStatus.SENT, DeliveryStatus.RETRY_PENDING, DeliveryStatus.DEAD] }, event: eventScope }, orderBy: { updatedAt: "desc" }, take: 8, select: { id: true, status: true, updatedAt: true, event: { select: { id: true, title: true } }, participant: { select: { name: true } } } }),
  ]);
  return [
    ...operations.map((item) => ({ id: `bulk:${item.id}`, eventId: item.event.id, eventTitle: item.event.title, at: item.updatedAt, kind: "bulk", message: `Bulk operation ${item.status.toLowerCase().replaceAll("_", " ")}.` })),
    ...jobs.map((item) => ({ id: `job:${item.id}`, eventId: item.event.id, eventTitle: item.event.title, at: item.updatedAt, kind: "job", message: `Certificate job for ${item.participant.name} failed${item.lastErrorCode ? ` (${item.lastErrorCode})` : ""}.` })),
    ...deliveries.map((item) => ({ id: `delivery:${item.id}`, eventId: item.event.id, eventTitle: item.event.title, at: item.updatedAt, kind: "delivery", message: item.status === DeliveryStatus.SENT ? `Certificate sent to ${item.participant.name}.` : item.status === DeliveryStatus.DEAD ? `Delivery for ${item.participant.name} moved to the DLQ.` : `Delivery for ${item.participant.name} moved to the retry queue.` })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 8);
}

function paginated<T>(data: T[], total: number, page: number, pageSize: number) {
  return { data, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}
