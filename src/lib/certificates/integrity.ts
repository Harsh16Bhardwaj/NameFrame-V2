import { createHash } from "node:crypto";

type CertificateIntegrityInput = {
  verificationId: string;
  participantName: string;
  eventTitle: string;
  organizationName: string;
  artifactUrl: string;
  issuedAt: Date;
};

export function createCertificateHash(input: CertificateIntegrityInput): string {
  const fields = [
    input.verificationId,
    input.participantName,
    input.eventTitle,
    input.organizationName,
    input.artifactUrl,
    input.issuedAt.toISOString(),
  ];
  const canonicalPayload = fields.map((value) => `${Buffer.byteLength(value, "utf8")}:${value}`).join("|");
  return createHash("sha256").update(canonicalPayload, "utf8").digest("hex");
}
