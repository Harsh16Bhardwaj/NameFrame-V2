CREATE TABLE "sertify"."WorkerLease" (
    "id" TEXT NOT NULL,
    "pool" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "workerId" TEXT,
    "claimedAt" TIMESTAMPTZ(3),
    "heartbeatAt" TIMESTAMPTZ(3),
    "leaseExpiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WorkerLease_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkerLease_pool_slot_key" ON "sertify"."WorkerLease"("pool", "slot");
CREATE INDEX "WorkerLease_pool_leaseExpiresAt_idx" ON "sertify"."WorkerLease"("pool", "leaseExpiresAt");
CREATE INDEX "WorkerLease_workerId_idx" ON "sertify"."WorkerLease"("workerId");
