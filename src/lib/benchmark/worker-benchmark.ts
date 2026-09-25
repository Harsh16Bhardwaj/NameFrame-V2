import { randomUUID } from "node:crypto";

import { EmailProvider } from "@/generated/prisma/enums";
import { createCertificateProcessor } from "@/lib/certificates/processor";
import { CertificateRenderError, type CertificateRenderer } from "@/lib/certificates/renderer";
import { prisma } from "@/lib/db/prisma";
import { EmailProviderError, type EmailMessage, type ResolvedEmailRoute } from "@/lib/delivery/types";
import { runPrimaryDeliveryWorker } from "@/lib/delivery/worker";
import { runCertificateWorker } from "@/lib/jobs/worker";

type BenchmarkInput = {
  count: number;
  workers: number;
  injectFailures: boolean;
  origin: string;
  requestedByUserId: string;
};

type TimedWorker = Awaited<ReturnType<typeof runCertificateWorker>> | Awaited<ReturnType<typeof runPrimaryDeliveryWorker>>;

export async function runWorkerBenchmark(eventId: string, input: BenchmarkInput) {
  const runId = randomUUID();
  const apiStartedAt = Date.now();
  const participantIds: string[] = [];
  const jobIds: string[] = [];
  const deliveryIds: string[] = [];
  const providerTimings = { cloudinaryMs: [] as number[], emailMs: [] as number[] };
  let cleanupMs = 0;
  let benchmarkResult: ({ timings: Record<string, number> } & Record<string, unknown>) | null = null;

  try {
    const seedStartedAt = Date.now();
    await prisma.participant.createMany({
      data: Array.from({ length: input.count }, (_, index) => ({
        eventId,
        name: `Benchmark Recipient ${index + 1}`,
        email: `worker-benchmark+${runId}-${index + 1}@example.test`,
        eligibleForCertificate: true,
      })),
    });
    const participants = await prisma.participant.findMany({
      where: { eventId, email: { startsWith: `worker-benchmark+${runId}-` } },
      select: { id: true, email: true },
      orderBy: { createdAt: "asc" },
    });
    participantIds.push(...participants.map((participant) => participant.id));
    await prisma.certificateJob.createMany({
      data: participants.map((participant, index) => ({
        eventId,
        participantId: participant.id,
        requestId: `benchmark-${runId}-${index + 1}`,
      })),
    });
    const jobs = await prisma.certificateJob.findMany({
      where: { eventId, requestId: { startsWith: `benchmark-${runId}-` } },
      select: { id: true, participantId: true },
    });
    jobIds.push(...jobs.map((job) => job.id));
    const failingGenerationIds = new Set(input.injectFailures ? jobs.filter((_, index) => (index + 1) % 7 === 0).map((job) => job.participantId) : []);
    const seedMs = Date.now() - seedStartedAt;

    const renderer = benchmarkRenderer(input.origin, failingGenerationIds, providerTimings.cloudinaryMs);
    const generationStartedAt = Date.now();
    const generationWorkers = await runWorkerPool(input.workers, async (workerIndex, wave) => runCertificateWorker({
      workerId: `benchmark-generation-${runId}-${wave}-${workerIndex}`,
      processor: createCertificateProcessor(renderer),
      jobIds,
      recoverStale: false,
    }));
    const generationMs = Date.now() - generationStartedAt;

    const deliveries = await prisma.delivery.findMany({
      where: { sourceCertificateJobId: { in: jobIds } },
      select: { id: true, recipientEmail: true },
      orderBy: { createdAt: "asc" },
    });
    deliveryIds.push(...deliveries.map((delivery) => delivery.id));
    const failingEmails = new Set(input.injectFailures ? deliveries.filter((_, index) => (index + 1) % 9 === 0).map((delivery) => delivery.recipientEmail) : []);
    const deliveryRoute = benchmarkEmailRoute(input.origin, failingEmails, providerTimings.emailMs);
    const deliveryStartedAt = Date.now();
    const deliveryWorkers = await runWorkerPool(input.workers, async (workerIndex, wave) => runPrimaryDeliveryWorker({
      workerId: `benchmark-delivery-${runId}-${wave}-${workerIndex}`,
      deliveryIds,
      recoverStale: false,
      resolvePrimary: async () => ({ type: "READY", route: deliveryRoute }),
      buildMessage: async (delivery) => benchmarkMessage(delivery),
      recordSuccess: async () => undefined,
      recordFailure: async () => undefined,
    }));
    const deliveryMs = Date.now() - deliveryStartedAt;

    const [jobGroups, deliveryGroups, attempts] = await Promise.all([
      prisma.certificateJob.groupBy({ by: ["status"], where: { id: { in: jobIds } }, _count: { _all: true } }),
      prisma.delivery.groupBy({ by: ["status"], where: { id: { in: deliveryIds } }, _count: { _all: true } }),
      prisma.deliveryAttempt.count({ where: { deliveryId: { in: deliveryIds } } }),
    ]);
    const totalBeforeCleanupMs = Date.now() - apiStartedAt;

    benchmarkResult = {
      runId,
      requestedByUserId: input.requestedByUserId,
      requested: input.count,
      workers: input.workers,
      injectFailures: input.injectFailures,
      timings: {
        seedMs,
        generationMs,
        deliveryMs,
        totalBeforeCleanupMs,
        cleanupMs: 0,
        averageCloudinaryMs: average(providerTimings.cloudinaryMs),
        averageEmailMs: average(providerTimings.emailMs),
      },
      throughput: {
        generatedPerSecond: rate(countStatus(jobGroups, "COMPLETED"), generationMs),
        sentPerSecond: rate(countStatus(deliveryGroups, "SENT"), deliveryMs),
      },
      jobs: Object.fromEntries(jobGroups.map((group) => [group.status, group._count._all])),
      deliveries: Object.fromEntries(deliveryGroups.map((group) => [group.status, group._count._all])),
      deliveryAttempts: attempts,
      generationWorkers,
      deliveryWorkers,
    };
    return benchmarkResult;
  } finally {
    const cleanupStartedAt = Date.now();
    await cleanupBenchmark(eventId, participantIds, jobIds, deliveryIds);
    cleanupMs = Date.now() - cleanupStartedAt;
    if (benchmarkResult) benchmarkResult.timings.cleanupMs = cleanupMs;
    console.info("Worker benchmark cleanup", { runId, eventId, participantCount: participantIds.length, jobCount: jobIds.length, deliveryCount: deliveryIds.length, cleanupMs });
  }
}

async function runWorkerPool(workerCount: number, invoke: (workerIndex: number, wave: number) => Promise<TimedWorker>) {
  const summaries: TimedWorker[] = [];
  for (let wave = 1; ; wave += 1) {
    const batch = await Promise.all(Array.from({ length: workerCount }, (_, index) => invoke(index + 1, wave)));
    summaries.push(...batch);
    if (batch.every((summary) => summary.claimed === 0)) break;
  }
  return summaries.filter((summary) => summary.claimed > 0);
}

function benchmarkRenderer(origin: string, failingParticipantIds: Set<string>, timings: number[]): CertificateRenderer {
  return async (renderInput) => {
    const response = await fetch(`${origin}/api/internal/benchmark/cloudinary`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": process.env.CRON_SECRET ?? "" },
      body: JSON.stringify({ width: renderInput.sourceWidth, height: renderInput.sourceHeight, fail: failingParticipantIds.has(renderInput.participantId) }),
    });
    const payload = await response.json() as { artifactUrl?: string; publicId?: string; width?: number; height?: number; durationMs?: number; code?: string };
    if (typeof payload.durationMs === "number") timings.push(payload.durationMs);
    if (!response.ok || !payload.artifactUrl || !payload.publicId || !payload.width || !payload.height) {
      throw new CertificateRenderError(payload.code ?? "CLOUDINARY_UNAVAILABLE", response.status >= 500, "Synthetic Cloudinary call failed.");
    }
    return { artifactUrl: payload.artifactUrl, publicId: payload.publicId, width: payload.width, height: payload.height };
  };
}

function benchmarkEmailRoute(origin: string, failingEmails: Set<string>, timings: number[]): ResolvedEmailRoute {
  return {
    key: "benchmark-email",
    provider: EmailProvider.RESEND,
    fromName: "NameFrame Benchmark",
    fromEmail: "benchmark@example.test",
    rateLimitPerMinute: 100_000,
    sendLimit: 100_000,
    adapter: {
      async send(message) {
        const response = await fetch(`${origin}/api/internal/benchmark/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-cron-secret": process.env.CRON_SECRET ?? "" },
          body: JSON.stringify({ to: message.to, fail: failingEmails.has(message.to) }),
        });
        const payload = await response.json() as { messageId?: string; durationMs?: number; code?: string };
        if (typeof payload.durationMs === "number") timings.push(payload.durationMs);
        if (!response.ok || !payload.messageId) throw new EmailProviderError(payload.code ?? "EMAIL_PROVIDER_UNAVAILABLE", true, true, "Synthetic email provider call failed.");
        return { messageId: payload.messageId };
      },
    },
  };
}

function benchmarkMessage(delivery: { recipientEmail: string; emailSubjectSnapshot: string; emailBodySnapshot: string; certificate: { artifactUrl: string } }): EmailMessage {
  return {
    to: delivery.recipientEmail,
    fromName: "NameFrame Benchmark",
    fromEmail: "benchmark@example.test",
    subject: delivery.emailSubjectSnapshot,
    text: `${delivery.emailBodySnapshot}\n\nCertificate: ${delivery.certificate.artifactUrl}`,
    html: `<p>Benchmark delivery</p><a href="${delivery.certificate.artifactUrl}">Certificate</a>`,
    certificateUrl: delivery.certificate.artifactUrl,
  };
}

async function cleanupBenchmark(eventId: string, participantIds: string[], jobIds: string[], deliveryIds: string[]) {
  if (!participantIds.length && !jobIds.length && !deliveryIds.length) return;
  await prisma.$transaction(async (transaction) => {
    if (deliveryIds.length) {
      await transaction.primaryDeliveryQueueItem.deleteMany({ where: { deliveryId: { in: deliveryIds } } });
      await transaction.retryDeliveryQueueItem.deleteMany({ where: { deliveryId: { in: deliveryIds } } });
      await transaction.deliveryAttempt.deleteMany({ where: { deliveryId: { in: deliveryIds } } });
      await transaction.deliveryDeadLetter.deleteMany({ where: { deliveryId: { in: deliveryIds } } });
      await transaction.delivery.deleteMany({ where: { id: { in: deliveryIds } } });
    }
    if (jobIds.length) {
      await transaction.certificate.deleteMany({ where: { certificateJobId: { in: jobIds } } });
      await transaction.certificateJob.deleteMany({ where: { id: { in: jobIds } } });
    }
    if (participantIds.length) await transaction.participant.deleteMany({ where: { id: { in: participantIds }, eventId } });
  });
}

function countStatus(groups: Array<{ status: string; _count: { _all: number } }>, status: string) {
  return groups.find((group) => group.status === status)?._count._all ?? 0;
}

function average(values: number[]) {
  return values.length ? Math.round(values.reduce((total, value) => total + value, 0) / values.length) : 0;
}

function rate(count: number, durationMs: number) {
  return durationMs ? Number((count / (durationMs / 1_000)).toFixed(2)) : 0;
}
