ALTER TABLE "Delivery"
ALTER COLUMN "maxAttempts" SET DEFAULT 4,
ADD COLUMN "retryCycle" INTEGER NOT NULL DEFAULT 0;

UPDATE "Delivery" SET "maxAttempts" = 4 WHERE "maxAttempts" = 5;

ALTER TABLE "DeliveryAttempt"
ADD COLUMN "providerRoute" TEXT NOT NULL DEFAULT 'legacy';

ALTER TABLE "OrganizationSmtpConfig"
ADD COLUMN "fromName" TEXT,
ADD COLUMN "fromEmail" TEXT,
ADD COLUMN "sendCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "sendLimit" INTEGER NOT NULL DEFAULT 10000,
ADD COLUMN "rateLimitPerMinute" INTEGER NOT NULL DEFAULT 30;

UPDATE "OrganizationSmtpConfig"
SET "fromName" = "label", "fromEmail" = "username"
WHERE "fromName" IS NULL OR "fromEmail" IS NULL;

ALTER TABLE "OrganizationSmtpConfig"
ALTER COLUMN "fromName" SET NOT NULL,
ALTER COLUMN "fromEmail" SET NOT NULL;

CREATE TABLE "PrimaryDeliveryQueueItem" (
  "id" TEXT NOT NULL,
  "deliveryId" TEXT NOT NULL,
  "provider" "EmailProvider",
  "providerRoute" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 2,
  "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedAt" TIMESTAMPTZ(3),
  "claimedBy" TEXT,
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "PrimaryDeliveryQueueItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RetryDeliveryQueueItem" (
  "id" TEXT NOT NULL,
  "deliveryId" TEXT NOT NULL,
  "provider" "EmailProvider" NOT NULL,
  "providerRoute" TEXT NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 2,
  "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedAt" TIMESTAMPTZ(3),
  "claimedBy" TEXT,
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "RetryDeliveryQueueItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeliveryDeadLetter" (
  "id" TEXT NOT NULL,
  "deliveryId" TEXT NOT NULL,
  "cycle" INTEGER NOT NULL,
  "failedProvider" "EmailProvider",
  "providerRoute" TEXT,
  "totalAttempts" INTEGER NOT NULL,
  "lastErrorCode" TEXT NOT NULL,
  "lastErrorMessage" TEXT NOT NULL,
  "movedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMPTZ(3),
  "resolvedByUserId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "DeliveryDeadLetter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailProviderRouteState" (
  "id" TEXT NOT NULL,
  "routeKey" TEXT NOT NULL,
  "provider" "EmailProvider" NOT NULL,
  "organizationId" TEXT,
  "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  "unhealthyUntil" TIMESTAMPTZ(3),
  "sendCount" INTEGER NOT NULL DEFAULT 0,
  "sendLimit" INTEGER NOT NULL DEFAULT 1000000,
  "rateLimitPerMinute" INTEGER NOT NULL DEFAULT 60,
  "windowStartedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "windowSendCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "EmailProviderRouteState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PrimaryDeliveryQueueItem_deliveryId_key" ON "PrimaryDeliveryQueueItem"("deliveryId");
CREATE INDEX "PrimaryDeliveryQueueItem_nextAttemptAt_createdAt_idx" ON "PrimaryDeliveryQueueItem"("nextAttemptAt", "createdAt");
CREATE INDEX "PrimaryDeliveryQueueItem_claimedAt_idx" ON "PrimaryDeliveryQueueItem"("claimedAt");
CREATE UNIQUE INDEX "RetryDeliveryQueueItem_deliveryId_key" ON "RetryDeliveryQueueItem"("deliveryId");
CREATE INDEX "RetryDeliveryQueueItem_nextAttemptAt_createdAt_idx" ON "RetryDeliveryQueueItem"("nextAttemptAt", "createdAt");
CREATE INDEX "RetryDeliveryQueueItem_claimedAt_idx" ON "RetryDeliveryQueueItem"("claimedAt");
CREATE UNIQUE INDEX "DeliveryDeadLetter_deliveryId_cycle_key" ON "DeliveryDeadLetter"("deliveryId", "cycle");
CREATE INDEX "DeliveryDeadLetter_resolvedAt_movedAt_idx" ON "DeliveryDeadLetter"("resolvedAt", "movedAt");
CREATE INDEX "DeliveryDeadLetter_resolvedByUserId_idx" ON "DeliveryDeadLetter"("resolvedByUserId");
CREATE UNIQUE INDEX "EmailProviderRouteState_routeKey_key" ON "EmailProviderRouteState"("routeKey");
CREATE INDEX "EmailProviderRouteState_organizationId_idx" ON "EmailProviderRouteState"("organizationId");
CREATE INDEX "EmailProviderRouteState_provider_unhealthyUntil_idx" ON "EmailProviderRouteState"("provider", "unhealthyUntil");

ALTER TABLE "PrimaryDeliveryQueueItem" ADD CONSTRAINT "PrimaryDeliveryQueueItem_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RetryDeliveryQueueItem" ADD CONSTRAINT "RetryDeliveryQueueItem_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryDeadLetter" ADD CONSTRAINT "DeliveryDeadLetter_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryDeadLetter" ADD CONSTRAINT "DeliveryDeadLetter_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailProviderRouteState" ADD CONSTRAINT "EmailProviderRouteState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "PrimaryDeliveryQueueItem" ("id", "deliveryId", "updatedAt")
SELECT 's6_' || "id", "id", CURRENT_TIMESTAMP
FROM "Delivery"
WHERE "status" = 'PENDING' AND "deletedAt" IS NULL
ON CONFLICT ("deliveryId") DO NOTHING;
