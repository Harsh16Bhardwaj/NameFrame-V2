import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { EventStatus, OrganizationRole } from "../src/generated/prisma/enums.ts";
import { requireSameOrganization } from "../src/lib/auth/permissions.ts";
import { prisma } from "../src/lib/db/prisma.ts";
import { AppError } from "../src/lib/errors/app-error.ts";
import { createOrganizationForUser, addOrganizationMember } from "../src/lib/organizations/service.ts";
import {
  createParticipantForEvent,
  listParticipantsForEvent,
  persistParticipantImport,
} from "../src/lib/participants/service.ts";

const runId = randomUUID();
const userIds: string[] = [];
let organizationId: string | null = null;

async function cleanUp() {
  if (organizationId) {
    await prisma.participant.deleteMany({ where: { event: { organizationId } } });
    await prisma.event.deleteMany({ where: { organizationId } });
    await prisma.organizationMember.deleteMany({ where: { organizationId } });
    await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { organizationId: null } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  }
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

try {
  const leader = await prisma.user.create({ data: { clerkUserId: `s3_leader_${runId}`, email: `s3_leader_${runId}@example.test`, name: "Sprint Three Leader" } });
  const member = await prisma.user.create({ data: { clerkUserId: `s3_member_${runId}`, email: `s3_member_${runId}@example.test`, name: "Sprint Three Member" } });
  userIds.push(leader.id, member.id);
  const organization = await createOrganizationForUser(leader.id, "Sprint Three Organization");
  organizationId = organization.id;
  await addOrganizationMember(leader.id, member.id);
  requireSameOrganization({ userId: member.id, organizationId: organization.id, role: OrganizationRole.GROUP_MEMBER }, organization.id);
  assert.throws(() => requireSameOrganization({ userId: member.id, organizationId: "another-organization", role: OrganizationRole.GROUP_MEMBER }, organization.id), (error) => error instanceof AppError && error.code === "AUTHORIZATION_ERROR");

  const event = await prisma.event.create({ data: { organizationId: organization.id, createdByUserId: leader.id, title: "Participant Integration", organizationName: organization.name, status: EventStatus.ACTIVE } });
  const manual = await createParticipantForEvent(event.id, { name: "Manual Participant", email: "MANUAL@example.test" });
  assert.equal(manual.email, "manual@example.test");
  await assert.rejects(() => createParticipantForEvent(event.id, { name: "Duplicate", email: manual.email }), (error) => error instanceof AppError && error.code === "PARTICIPANT_ALREADY_EXISTS");
  await prisma.participant.update({ where: { id: manual.id }, data: { deletedAt: new Date(), eligibleForCertificate: false } });
  const restored = await createParticipantForEvent(event.id, { name: "Restored Participant", email: manual.email, eligibleForCertificate: true });
  assert.equal(restored.id, manual.id);
  assert.equal(restored.deletedAt, null);

  const rows = Array.from({ length: 10_000 }, (_, index) => index === 0
    ? { name: "Existing", email: manual.email, eligibleForCertificate: false }
    : { name: `Imported ${index.toString().padStart(5, "0")}`, email: `import-${index.toString().padStart(5, "0")}@example.test`, eligibleForCertificate: index % 2 === 0 });
  const imported = await persistParticipantImport(event.id, rows);
  assert.deepEqual(imported, { requestedCount: 10_000, insertedCount: 9_999, skippedCount: 1, failedCount: 0, errorCode: null });

  const firstPage = await listParticipantsForEvent(event.id, new URLSearchParams({ page: "1", limit: "50" }));
  assert.equal(firstPage.participants.length, 50);
  assert.equal(firstPage.pagination.total, 10_000);
  assert.equal(firstPage.counts.totalParticipants, 10_000);
  const eligible = await listParticipantsForEvent(event.id, new URLSearchParams({ eligibility: "eligible", limit: "25" }));
  assert.equal(eligible.pagination.total, 5_000);
  const searched = await listParticipantsForEvent(event.id, new URLSearchParams({ search: "import-09999@example.test" }));
  assert.equal(searched.pagination.total, 1);

  const removed = searched.participants[0];
  await prisma.participant.update({ where: { id: removed.id }, data: { deletedAt: new Date(), eligibleForCertificate: false } });
  const afterDelete = await listParticipantsForEvent(event.id, new URLSearchParams({ search: removed.email }));
  assert.equal(afterDelete.pagination.total, 0);

  console.log("Sprint 03 CRUD, restoration, authorization, pagination, search, eligibility, and 10k import checks passed.");
} finally {
  await cleanUp();
  await prisma.$disconnect();
}
