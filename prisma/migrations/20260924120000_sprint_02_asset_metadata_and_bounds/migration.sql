ALTER TABLE "Organization" ADD COLUMN "logoPublicId" TEXT;

ALTER TABLE "CertificateTemplate"
DROP CONSTRAINT "CertificateTemplate_name_bounds_valid";

ALTER TABLE "CertificateTemplate"
ADD CONSTRAINT "CertificateTemplate_name_bounds_valid"
CHECK (
  "nameLeft" >= 0
  AND "nameTop" >= 0
  AND "nameRight" <= 1
  AND "nameBottom" <= 1
  AND "nameLeft" < "nameRight"
  AND "nameTop" < "nameBottom"
);
