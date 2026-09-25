import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { EventStatus, OrganizationRole } from "../src/generated/prisma/enums.ts";
import { requireGroupLeader } from "../src/lib/auth/permissions.ts";
import { prisma } from "../src/lib/db/prisma.ts";
import { AppError } from "../src/lib/errors/app-error.ts";
import { parseEventFields, validateFinalEvent } from "../src/lib/events/validation.ts";
import { addOrganizationMember, createOrganizationForUser } from "../src/lib/organizations/service.ts";
import { destroyImage, uploadImage } from "../src/lib/uploads/cloudinary.ts";

const runId = randomUUID();
const userIds: string[] = [];
let organizationId: string | null = null;

async function testCloudinary() {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const file = new File([png], "sprint-02-check.png", { type: "image/png" });
  const uploaded = await uploadImage(file, "sertify/validation");
  assert.ok(uploaded.secure_url.startsWith("https://"));
  await destroyImage(uploaded.public_id);
}

async function cleanUp() {
  if (organizationId) {
    await prisma.certificateTemplate.deleteMany({ where: { event: { organizationId } } });
    await prisma.certificateAsset.deleteMany({ where: { organizationId } });
    await prisma.event.deleteMany({ where: { organizationId } });
    await prisma.organizationMember.deleteMany({ where: { organizationId } });
    await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { organizationId: null } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  }
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

try {
  const leader = await prisma.user.create({ data: { clerkUserId: `s2_leader_${runId}`, email: `s2_leader_${runId}@example.test`, name: "Sprint Two Leader" } });
  const member = await prisma.user.create({ data: { clerkUserId: `s2_member_${runId}`, email: `s2_member_${runId}@example.test`, name: "Sprint Two Member" } });
  userIds.push(leader.id, member.id);
  const organization = await createOrganizationForUser(leader.id, "Sprint Two Organization");
  organizationId = organization.id;
  await addOrganizationMember(leader.id, member.id);

  assert.throws(
    () => requireGroupLeader({ userId: member.id, organizationId: organization.id, role: OrganizationRole.GROUP_MEMBER }),
    (error) => error instanceof AppError && error.code === "AUTHORIZATION_ERROR",
  );

  const draft = await prisma.event.create({ data: { organizationId: organization.id, createdByUserId: leader.id, title: "", organizationName: organization.name } });
  await assert.rejects(() => prisma.event.create({ data: { organizationId: organization.id, createdByUserId: leader.id, title: "Second draft", organizationName: organization.name } }));

  const fields = parseEventFields({ title: "Sprint Two Event", eventDate: "2026-11-12", certificateTitle: "Completion", emailSubject: "Your certificate", emailBody: "Attached is your certificate.", location: "Remote" });
  validateFinalEvent(fields);
  const asset = await prisma.certificateAsset.create({ data: { eventId: draft.id, organizationId: organization.id, uploadedByUserId: leader.id, publicId: `s2/${runId}`, secureUrl: "https://example.test/sprint-02.png", format: "png", width: 1200, height: 850, bytes: 2048 } });
  await prisma.certificateTemplate.create({ data: { eventId: draft.id, assetId: asset.id, backgroundUrl: asset.secureUrl, nameLeft: 0.25, nameTop: 0.42, nameRight: 0.75, nameBottom: 0.56 } });
  const active = await prisma.event.update({ where: { id: draft.id }, data: { ...fields, status: EventStatus.ACTIVE }, include: { template: true } });
  assert.equal(active.status, EventStatus.ACTIVE);
  assert.ok(active.template);

  await prisma.certificateTemplate.delete({ where: { eventId: draft.id } });
  assert.equal(await prisma.certificateTemplate.count({ where: { eventId: draft.id } }), 0);
  const replacementAsset = await prisma.certificateAsset.create({ data: { eventId: draft.id, organizationId: organization.id, uploadedByUserId: member.id, publicId: `s2/replacement/${runId}`, secureUrl: "https://example.test/replacement.png", format: "png", width: 1200, height: 850, bytes: 2048 } });
  await prisma.certificateTemplate.create({ data: { eventId: draft.id, assetId: replacementAsset.id, backgroundUrl: replacementAsset.secureUrl, nameLeft: 0.2, nameTop: 0.4, nameRight: 0.8, nameBottom: 0.58, fontWeight: "700" } });
  assert.equal(await prisma.certificateTemplate.count({ where: { eventId: draft.id } }), 1);

  await testCloudinary();
  console.log("Sprint 02 database, authorization, draft, template, and Cloudinary checks passed.");
} finally {
  await cleanUp();
  await prisma.$disconnect();
}
