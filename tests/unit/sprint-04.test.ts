import assert from "node:assert/strict";
import test from "node:test";

import { BulkOperationStatus } from "../../src/generated/prisma/enums.ts";
import { deriveBulkStatusFromJobs } from "../../src/lib/jobs/bulk-operation.ts";
import { retryDelayMs } from "../../src/lib/jobs/retry.ts";
import { isAuthorizedWorkerRequest } from "../../src/lib/jobs/worker-auth.ts";

test("certificate retry backoff increases and caps deterministically", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(retryDelayMs), [30_000, 120_000, 600_000, 1_200_000, 1_800_000, 1_800_000]);
});

test("bulk status is derived from child job states", () => {
  assert.equal(deriveBulkStatusFromJobs({ total: 5, pending: 5, processing: 0, completed: 0, dead: 0 }), BulkOperationStatus.PENDING);
  assert.equal(deriveBulkStatusFromJobs({ total: 5, pending: 2, processing: 1, completed: 2, dead: 0 }), BulkOperationStatus.PROCESSING);
  assert.equal(deriveBulkStatusFromJobs({ total: 5, pending: 0, processing: 0, completed: 4, dead: 1 }), BulkOperationStatus.PARTIAL_FAILURE);
});

test("worker authorization requires the exact configured secret", () => {
  const authorized = new Request("http://localhost/api/internal/workers/certificates", { headers: { authorization: "Bearer sprint-secret" } });
  const rejected = new Request("http://localhost/api/internal/workers/certificates", { headers: { authorization: "Bearer wrong" } });
  assert.equal(isAuthorizedWorkerRequest(authorized, "sprint-secret"), true);
  assert.equal(isAuthorizedWorkerRequest(rejected, "sprint-secret"), false);
  assert.equal(isAuthorizedWorkerRequest(authorized, undefined), false);
});
