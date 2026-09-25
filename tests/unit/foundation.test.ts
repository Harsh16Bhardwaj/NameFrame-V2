import assert from "node:assert/strict";
import test from "node:test";

import {
  BulkOperationStatus,
  EventStatus,
  OrganizationRole,
} from "../../src/generated/prisma/enums.ts";
import { buildLocalUserValues } from "../../src/lib/auth/clerk-user.ts";
import { requireGroupLeader, requireSameOrganization } from "../../src/lib/auth/permissions.ts";
import { AppError } from "../../src/lib/errors/app-error.ts";
import { assertEventAllowsSending } from "../../src/lib/events/rules.ts";
import { deriveBulkOperationStatus } from "../../src/lib/jobs/bulk-operation.ts";
import { decryptCredential, encryptCredential } from "../../src/lib/security/encryption.ts";

test("Clerk users are normalized for local storage", () => {
  assert.deepEqual(
    buildLocalUserValues({
      id: "user_1",
      firstName: "  Harsh ",
      lastName: " Bhardwaj  ",
      primaryEmailAddress: "  HARSH@EXAMPLE.COM ",
    }),
    {
      clerkUserId: "user_1",
      email: "harsh@example.com",
      name: "Harsh Bhardwaj",
    },
  );
});

test("leader-only permissions fail closed for members", () => {
  assert.throws(
    () =>
      requireGroupLeader({
        userId: "member",
        organizationId: "org",
        role: OrganizationRole.GROUP_MEMBER,
      }),
    (error) => error instanceof AppError && error.code === "AUTHORIZATION_ERROR",
  );
});

test("resource access is scoped to one organization", () => {
  assert.throws(
    () =>
      requireSameOrganization(
        {
          userId: "leader",
          organizationId: "org-a",
          role: OrganizationRole.GROUP_LEADER,
        },
        "org-b",
      ),
    (error) => error instanceof AppError && error.code === "AUTHORIZATION_ERROR",
  );
});

test("draft events cannot send while active and completed events can", () => {
  assert.throws(
    () => assertEventAllowsSending(EventStatus.DRAFT),
    (error) => error instanceof AppError && error.code === "CONFLICT",
  );
  assert.doesNotThrow(() => assertEventAllowsSending(EventStatus.ACTIVE));
  assert.doesNotThrow(() => assertEventAllowsSending(EventStatus.COMPLETED));
});

test("bulk status distinguishes total failure from partial failure", () => {
  assert.equal(
    deriveBulkOperationStatus({ totalCount: 10, completedCount: 7, failedCount: 3 }),
    BulkOperationStatus.PARTIAL_FAILURE,
  );
  assert.equal(
    deriveBulkOperationStatus({ totalCount: 10, completedCount: 0, failedCount: 10 }),
    BulkOperationStatus.FAILED,
  );
  assert.equal(
    deriveBulkOperationStatus({ totalCount: 10, completedCount: 10, failedCount: 0 }),
    BulkOperationStatus.COMPLETED,
  );
});

test("SMTP credentials use authenticated encryption", () => {
  process.env.APP_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  const encrypted = encryptCredential("smtp-secret");

  assert.notEqual(encrypted, "smtp-secret");
  assert.equal(decryptCredential(encrypted), "smtp-secret");
});
