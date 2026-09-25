import "dotenv/config";

import assert from "node:assert/strict";

import { prisma } from "../src/lib/db/prisma";
import {
  acquireWorkerLeases,
  MAX_ACTIVE_WORKERS_PER_POOL,
  releaseWorkerLease,
} from "../src/lib/jobs/worker-pool";

const pool = "certificate-pipeline" as const;

try {
  await prisma.workerLease.deleteMany({ where: { pool } });

  const concurrentDispatches = await Promise.all(
    Array.from({ length: 10 }, () => acquireWorkerLeases(pool)),
  );
  const leases = concurrentDispatches.flat();

  assert.equal(leases.length, MAX_ACTIVE_WORKERS_PER_POOL, "ten concurrent dispatches must acquire only four total workers");
  assert.equal(new Set(leases.map((lease) => lease.slot)).size, MAX_ACTIVE_WORKERS_PER_POOL, "each active worker must own a unique slot");
  assert.equal((await acquireWorkerLeases(pool)).length, 0, "a full pool must reject additional worker acquisition");

  await Promise.all(leases.map((lease) => releaseWorkerLease(lease)));
  const reacquired = await acquireWorkerLeases(pool);
  assert.equal(reacquired.length, MAX_ACTIVE_WORKERS_PER_POOL, "released slots must be reusable");
  await Promise.all(reacquired.map((lease) => releaseWorkerLease(lease)));

  console.info("Worker pool verification passed: 10 concurrent wake-ups produced exactly 4 active workers.");
} finally {
  await prisma.workerLease.deleteMany({ where: { pool } });
  await prisma.$disconnect();
}
