ALTER TABLE "BulkOperation"
ADD COLUMN "operationRequestId" TEXT;

UPDATE "BulkOperation"
SET "operationRequestId" = "id"
WHERE "operationRequestId" IS NULL;

ALTER TABLE "BulkOperation"
ALTER COLUMN "operationRequestId" SET NOT NULL;

ALTER TABLE "CertificateJob"
ADD COLUMN "requestId" TEXT,
ADD COLUMN "nextAttemptAt" TIMESTAMPTZ(3),
ALTER COLUMN "maxAttempts" SET DEFAULT 6;

UPDATE "CertificateJob"
SET "requestId" = "id"
WHERE "requestId" IS NULL;

ALTER TABLE "CertificateJob"
ALTER COLUMN "requestId" SET NOT NULL;

DROP INDEX "CertificateJob_status_createdAt_idx";

CREATE UNIQUE INDEX "BulkOperation_eventId_operationRequestId_key"
ON "BulkOperation"("eventId", "operationRequestId");

CREATE UNIQUE INDEX "CertificateJob_eventId_participantId_requestId_key"
ON "CertificateJob"("eventId", "participantId", "requestId");

CREATE INDEX "CertificateJob_status_nextAttemptAt_createdAt_idx"
ON "CertificateJob"("status", "nextAttemptAt", "createdAt");

CREATE INDEX "CertificateJob_status_claimedAt_idx"
ON "CertificateJob"("status", "claimedAt");
