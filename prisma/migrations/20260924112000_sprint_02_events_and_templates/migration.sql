-- Sprint 02 owns uploaded certificate assets separately from templates so a
-- template can reference only a server-verified Cloudinary upload.
CREATE TABLE "CertificateAsset" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "secureUrl" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "CertificateAsset_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CertificateTemplate"
ADD COLUMN "assetId" TEXT NOT NULL,
ADD COLUMN "fontSize" INTEGER NOT NULL DEFAULT 48,
ADD COLUMN "fontColor" TEXT NOT NULL DEFAULT '#000000',
ADD COLUMN "fontWeight" TEXT NOT NULL DEFAULT '600',
ADD COLUMN "textAlign" TEXT NOT NULL DEFAULT 'center';

CREATE UNIQUE INDEX "CertificateAsset_publicId_key" ON "CertificateAsset"("publicId");
CREATE INDEX "CertificateAsset_eventId_deletedAt_idx" ON "CertificateAsset"("eventId", "deletedAt");
CREATE INDEX "CertificateAsset_organizationId_idx" ON "CertificateAsset"("organizationId");
CREATE INDEX "CertificateAsset_uploadedByUserId_idx" ON "CertificateAsset"("uploadedByUserId");
CREATE UNIQUE INDEX "CertificateTemplate_assetId_key" ON "CertificateTemplate"("assetId");

-- One creator gets one resumable live draft in an organization.
CREATE UNIQUE INDEX "Event_one_live_draft_per_creator"
ON "Event" ("organizationId", "createdByUserId")
WHERE "status" = 'DRAFT' AND "deletedAt" IS NULL;

ALTER TABLE "CertificateAsset"
ADD CONSTRAINT "CertificateAsset_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CertificateAsset"
ADD CONSTRAINT "CertificateAsset_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CertificateAsset"
ADD CONSTRAINT "CertificateAsset_uploadedByUserId_fkey"
FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CertificateTemplate"
ADD CONSTRAINT "CertificateTemplate_assetId_fkey"
FOREIGN KEY ("assetId") REFERENCES "CertificateAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CertificateAsset"
ADD CONSTRAINT "CertificateAsset_dimensions_check"
CHECK ("width" > 0 AND "height" > 0 AND "bytes" > 0);

ALTER TABLE "CertificateTemplate"
ADD CONSTRAINT "CertificateTemplate_style_check"
CHECK (
    "fontSize" BETWEEN 8 AND 160
    AND "fontColor" ~ '^#[0-9A-Fa-f]{6}$'
    AND "fontWeight" IN ('400', '500', '600', '700')
    AND "textAlign" IN ('left', 'center', 'right')
);
