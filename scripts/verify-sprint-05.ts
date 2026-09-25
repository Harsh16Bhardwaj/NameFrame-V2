import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { CertificateJobStatus, DeliveryStatus, EventStatus } from "../src/generated/prisma/enums.ts";
import { createCertificateProcessor } from "../src/lib/certificates/processor.ts";
import { CertificateRenderError, certificatePublicId, type CertificateRenderer } from "../src/lib/certificates/renderer.ts";
import { prisma } from "../src/lib/db/prisma.ts";
import { createSingleCertificateJobForEvent } from "../src/lib/jobs/service.ts";
import { runCertificateWorker } from "../src/lib/jobs/worker.ts";
import { createOrganizationForUser } from "../src/lib/organizations/service.ts";
import { destroyImage, uploadImage } from "../src/lib/uploads/cloudinary.ts";

const runId = randomUUID();
let userId: string | null = null;
let organizationId: string | null = null;
const cloudinaryPublicIds = new Set<string>();

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

async function cleanUp() {
  if (organizationId) {
    await prisma.delivery.deleteMany({ where: { event: { organizationId } } });
    await prisma.certificate.deleteMany({ where: { event: { organizationId } } });
    await prisma.certificateJob.deleteMany({ where: { event: { organizationId } } });
    await prisma.certificateTemplate.deleteMany({ where: { event: { organizationId } } });
    await prisma.certificateAsset.deleteMany({ where: { organizationId } });
    await prisma.participant.deleteMany({ where: { event: { organizationId } } });
    await prisma.bulkOperation.deleteMany({ where: { event: { organizationId } } });
    await prisma.event.deleteMany({ where: { organizationId } });
    await prisma.organizationMember.deleteMany({ where: { organizationId } });
    if (userId) await prisma.user.update({ where: { id: userId }, data: { organizationId: null } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  }
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  for (const publicId of cloudinaryPublicIds) {
    try {
      await destroyImage(publicId);
    } catch {
      console.warn("Sprint 05 cleanup could not remove a Cloudinary test asset", { publicId });
    }
  }
}

function fakeArtifact(eventId: string, participantId: string) {
  const publicId = certificatePublicId(eventId, participantId);
  return { artifactUrl: `https://example.test/${publicId}.png`, publicId, width: 1200, height: 850 };
}

try {
  const leader = await prisma.user.create({
    data: { clerkUserId: `s5_${runId}`, email: `s5_${runId}@example.test`, name: "Sprint Five Leader" },
  });
  userId = leader.id;
  const organization = await createOrganizationForUser(leader.id, "Sprint Five Organization");
  organizationId = organization.id;
  const event = await prisma.event.create({
    data: {
      organizationId: organization.id,
      createdByUserId: leader.id,
      title: "Certificate Issuance",
      organizationName: organization.name,
      emailSubject: "Your certificate",
      emailBody: "Congratulations. Your certificate is ready.",
      status: EventStatus.ACTIVE,
    },
  });

  const uploaded = await uploadImage(new File([png], "sprint-05-source.png", { type: "image/png" }), "sprint-05/templates");
  cloudinaryPublicIds.add(uploaded.public_id);
  const asset = await prisma.certificateAsset.create({
    data: {
      eventId: event.id,
      organizationId: organization.id,
      uploadedByUserId: leader.id,
      publicId: uploaded.public_id,
      secureUrl: uploaded.secure_url,
      format: uploaded.format,
      width: 1200,
      height: 850,
      bytes: uploaded.bytes,
    },
  });
  const template = await prisma.certificateTemplate.create({
    data: {
      eventId: event.id,
      assetId: asset.id,
      backgroundUrl: asset.secureUrl,
      nameLeft: 0.15,
      nameTop: 0.4,
      nameRight: 0.85,
      nameBottom: 0.6,
      fontSize: 72,
      fontColor: "#13213c",
      fontWeight: "600",
      textAlign: "center",
    },
  });
  const participants = await Promise.all(["Ada Lovelace", "Grace Hopper", "Alan Turing", "Permanent Failure", "Crash Recovery"].map((name, index) =>
    prisma.participant.create({
      data: {
        eventId: event.id,
        name,
        email: `s5-${index}-${runId}@example.test`,
        eligibleForCertificate: true,
      },
    }),
  ));

  const liveJob = await createSingleCertificateJobForEvent(event.id, participants[0].id, `live-${runId}`);
  const liveSummary = await runCertificateWorker({ workerId: `live-${runId}` });
  assert.equal(liveSummary.completed, 1);
  const certificate = await prisma.certificate.findUniqueOrThrow({
    where: { eventId_participantId: { eventId: event.id, participantId: participants[0].id } },
  });
  cloudinaryPublicIds.add(certificate.artifactPublicId);
  assert.equal(certificate.artifactPublicId, certificatePublicId(event.id, participants[0].id));
  assert.match(certificate.artifactUrl, /\.png$/);
  assert.equal(certificate.artifactWidth, 1200);
  assert.equal(certificate.artifactHeight, 850);
  const artifactResponse = await fetch(certificate.artifactUrl);
  assert.equal(artifactResponse.ok, true);
  assert.match(artifactResponse.headers.get("content-type") ?? "", /^image\/png/i);
  assert.match(certificate.verificationId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.match(certificate.certificateHash, /^[a-f0-9]{64}$/);
  assert.equal(certificate.participantNameSnapshot, participants[0].name);
  assert.equal(certificate.fontColorSnapshot, template.fontColor);
  const liveDelivery = await prisma.delivery.findUniqueOrThrow({ where: { sourceCertificateJobId: liveJob.id } });
  assert.equal(liveDelivery.status, DeliveryStatus.PENDING);
  assert.equal(liveDelivery.emailSubjectSnapshot, event.emailSubject);
  assert.equal(liveDelivery.emailBodySnapshot, event.emailBody);

  const resend = await createSingleCertificateJobForEvent(event.id, participants[0].id, `resend-${runId}`);
  await runCertificateWorker({ workerId: `resend-${runId}` });
  assert.equal(await prisma.certificate.count({ where: { eventId: event.id, participantId: participants[0].id } }), 1);
  assert.equal(await prisma.delivery.count({ where: { certificateId: certificate.id } }), 2);
  assert.equal((await prisma.delivery.findUniqueOrThrow({ where: { sourceCertificateJobId: resend.id } })).certificateId, certificate.id);

  let concurrentRenderCount = 0;
  const concurrentRenderer: CertificateRenderer = async (input) => {
    concurrentRenderCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 75));
    return fakeArtifact(input.eventId, input.participantId);
  };
  const concurrentJobs = await Promise.all([
    createSingleCertificateJobForEvent(event.id, participants[1].id, `concurrent-a-${runId}`),
    createSingleCertificateJobForEvent(event.id, participants[1].id, `concurrent-b-${runId}`),
  ]);
  await Promise.all(concurrentJobs.map((job, index) => prisma.certificateJob.update({
    where: { id: job.id },
    data: { status: CertificateJobStatus.PROCESSING, claimedBy: `concurrent-worker-${index}`, claimedAt: new Date(), attemptCount: 1 },
  })));
  const concurrentProcessor = createCertificateProcessor(concurrentRenderer);
  const concurrentOutcomes = await Promise.all(concurrentJobs.map((job, index) =>
    concurrentProcessor({ ...job, status: CertificateJobStatus.PROCESSING, claimedBy: `concurrent-worker-${index}`, claimedAt: new Date(), attemptCount: 1 }, { workerId: `concurrent-worker-${index}` }),
  ));
  assert.ok(concurrentOutcomes.every((outcome) => outcome.type === "SUCCESS"));
  assert.equal(concurrentRenderCount, 2);
  assert.equal(await prisma.certificate.count({ where: { eventId: event.id, participantId: participants[1].id } }), 1);
  assert.equal(await prisma.delivery.count({ where: { participantId: participants[1].id } }), 2);

  let retryCalls = 0;
  const retryProcessor = createCertificateProcessor(async (input) => {
    retryCalls += 1;
    if (retryCalls === 1) throw new CertificateRenderError("CLOUDINARY_UNAVAILABLE", true, "Synthetic provider outage.");
    return fakeArtifact(input.eventId, input.participantId);
  });
  const retryJob = await createSingleCertificateJobForEvent(event.id, participants[2].id, `retry-${runId}`);
  await runCertificateWorker({ workerId: `retry-first-${runId}`, processor: retryProcessor });
  let retryState = await prisma.certificateJob.findUniqueOrThrow({ where: { id: retryJob.id } });
  assert.equal(retryState.status, CertificateJobStatus.RETRY_PENDING);
  assert.equal(retryState.lastErrorCode, "CLOUDINARY_UNAVAILABLE");
  await prisma.certificateJob.update({ where: { id: retryJob.id }, data: { nextAttemptAt: new Date(Date.now() - 1_000) } });
  await runCertificateWorker({ workerId: `retry-second-${runId}`, processor: retryProcessor });
  retryState = await prisma.certificateJob.findUniqueOrThrow({ where: { id: retryJob.id } });
  assert.equal(retryState.status, CertificateJobStatus.COMPLETED);
  assert.equal(await prisma.certificate.count({ where: { participantId: participants[2].id } }), 1);
  assert.equal(await prisma.delivery.count({ where: { sourceCertificateJobId: retryJob.id } }), 1);

  await prisma.participant.update({ where: { id: participants[3].id }, data: { name: "W".repeat(200) } });
  await prisma.certificateTemplate.update({
    where: { id: template.id },
    data: { nameLeft: 0.49, nameTop: 0.49, nameRight: 0.51, nameBottom: 0.51, fontSize: 8 },
  });
  const permanentJob = await createSingleCertificateJobForEvent(event.id, participants[3].id, `permanent-${runId}`);
  await runCertificateWorker({ workerId: `permanent-${runId}`, processor: createCertificateProcessor(async (input) => fakeArtifact(input.eventId, input.participantId)) });
  const permanentState = await prisma.certificateJob.findUniqueOrThrow({ where: { id: permanentJob.id } });
  assert.equal(permanentState.status, CertificateJobStatus.DEAD);
  assert.equal(permanentState.lastErrorCode, "CERTIFICATE_NAME_DOES_NOT_FIT");
  assert.equal(await prisma.certificate.count({ where: { participantId: participants[3].id } }), 0);
  assert.equal(await prisma.delivery.count({ where: { participantId: participants[3].id } }), 0);
  await prisma.certificateTemplate.update({
    where: { id: template.id },
    data: { nameLeft: 0.15, nameTop: 0.4, nameRight: 0.85, nameBottom: 0.6, fontSize: 72 },
  });

  const crashPublicIds: string[] = [];
  const crashProcessor = createCertificateProcessor(async (input) => {
    crashPublicIds.push(certificatePublicId(input.eventId, input.participantId));
    if (crashPublicIds.length === 1) throw new CertificateRenderError("CLOUDINARY_UNAVAILABLE", true, "Synthetic post-upload crash.");
    return fakeArtifact(input.eventId, input.participantId);
  });
  const crashJob = await createSingleCertificateJobForEvent(event.id, participants[4].id, `crash-${runId}`);
  await runCertificateWorker({ workerId: `crash-first-${runId}`, processor: crashProcessor });
  await prisma.certificateJob.update({ where: { id: crashJob.id }, data: { nextAttemptAt: new Date(Date.now() - 1_000) } });
  await runCertificateWorker({ workerId: `crash-second-${runId}`, processor: crashProcessor });
  assert.equal(crashPublicIds.length, 2);
  assert.equal(crashPublicIds[0], crashPublicIds[1]);
  assert.equal(await prisma.certificate.count({ where: { participantId: participants[4].id } }), 1);
  assert.equal(await prisma.delivery.count({ where: { sourceCertificateJobId: crashJob.id } }), 1);

  console.log("Sprint 05 live Cloudinary rendering, issuance, reuse, snapshots, retry, crash recovery, and concurrency checks passed.");
} finally {
  await cleanUp();
  await prisma.$disconnect();
}
