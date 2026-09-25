ALTER TABLE "Certificate"
ADD COLUMN "artifactPublicId" TEXT,
ADD COLUMN "artifactWidth" INTEGER,
ADD COLUMN "artifactHeight" INTEGER,
ADD COLUMN "fontSizeSnapshot" INTEGER,
ADD COLUMN "fontColorSnapshot" TEXT,
ADD COLUMN "fontWeightSnapshot" TEXT,
ADD COLUMN "textAlignSnapshot" TEXT,
ADD COLUMN "certificateHash" TEXT;

UPDATE "Certificate"
SET
  "artifactPublicId" = 'legacy/' || "id",
  "artifactWidth" = 1,
  "artifactHeight" = 1,
  "fontSizeSnapshot" = 48,
  "fontColorSnapshot" = '#000000',
  "fontWeightSnapshot" = '600',
  "textAlignSnapshot" = 'center',
  "certificateHash" = "verificationId"
WHERE "artifactPublicId" IS NULL;

ALTER TABLE "Certificate"
ALTER COLUMN "artifactPublicId" SET NOT NULL,
ALTER COLUMN "artifactWidth" SET NOT NULL,
ALTER COLUMN "artifactHeight" SET NOT NULL,
ALTER COLUMN "fontSizeSnapshot" SET NOT NULL,
ALTER COLUMN "fontColorSnapshot" SET NOT NULL,
ALTER COLUMN "fontWeightSnapshot" SET NOT NULL,
ALTER COLUMN "textAlignSnapshot" SET NOT NULL,
ALTER COLUMN "certificateHash" SET NOT NULL;

CREATE UNIQUE INDEX "Certificate_eventId_participantId_key"
ON "Certificate"("eventId", "participantId");

ALTER TABLE "Delivery"
ADD COLUMN "sourceCertificateJobId" TEXT,
ADD COLUMN "emailSubjectSnapshot" TEXT,
ADD COLUMN "emailBodySnapshot" TEXT;

UPDATE "Delivery" AS delivery
SET
  "sourceCertificateJobId" = certificate."certificateJobId",
  "emailSubjectSnapshot" = COALESCE(event."emailSubject", ''),
  "emailBodySnapshot" = COALESCE(event."emailBody", '')
FROM "Certificate" AS certificate, "Event" AS event
WHERE delivery."certificateId" = certificate."id"
  AND delivery."eventId" = event."id"
  AND delivery."sourceCertificateJobId" IS NULL;

ALTER TABLE "Delivery"
ALTER COLUMN "sourceCertificateJobId" SET NOT NULL,
ALTER COLUMN "emailSubjectSnapshot" SET NOT NULL,
ALTER COLUMN "emailBodySnapshot" SET NOT NULL;

CREATE UNIQUE INDEX "Delivery_sourceCertificateJobId_key"
ON "Delivery"("sourceCertificateJobId");

ALTER TABLE "Delivery"
ADD CONSTRAINT "Delivery_sourceCertificateJobId_fkey"
FOREIGN KEY ("sourceCertificateJobId") REFERENCES "CertificateJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
