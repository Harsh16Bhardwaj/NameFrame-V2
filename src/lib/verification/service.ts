import { prisma } from "@/lib/db/prisma";
import { createCertificateHash } from "@/lib/certificates/integrity";
import { normalizeVerificationCode } from "@/lib/verification/code";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type VerificationResult =
  | { status: "VERIFIED"; certificate: { verificationId: string; participantName: string; eventTitle: string; organizationName: string; issuedAt: Date; artifactUrl: string } }
  | { status: "NOT_FOUND" }
  | { status: "INTEGRITY_FAILED" };

export async function verifyCertificate(verificationId: string): Promise<VerificationResult> {
  const normalizedVerificationId = normalizeVerificationCode(verificationId);
  if (!UUID_PATTERN.test(normalizedVerificationId)) return { status: "NOT_FOUND" };
  const certificate = await prisma.certificate.findUnique({
    where: { verificationId: normalizedVerificationId },
    select: { verificationId: true, participantNameSnapshot: true, eventTitleSnapshot: true, organizationNameSnapshot: true, issuedAt: true, artifactUrl: true, certificateHash: true },
  });
  if (!certificate) return { status: "NOT_FOUND" };
  const expectedHash = createCertificateHash({
    verificationId: certificate.verificationId,
    participantName: certificate.participantNameSnapshot,
    eventTitle: certificate.eventTitleSnapshot,
    organizationName: certificate.organizationNameSnapshot,
    artifactUrl: certificate.artifactUrl,
    issuedAt: certificate.issuedAt,
  });
  if (expectedHash !== certificate.certificateHash) {
    console.error("Certificate integrity verification failed", { verificationId: certificate.verificationId });
    return { status: "INTEGRITY_FAILED" };
  }
  return { status: "VERIFIED", certificate: {
    verificationId: certificate.verificationId,
    participantName: certificate.participantNameSnapshot,
    eventTitle: certificate.eventTitleSnapshot,
    organizationName: certificate.organizationNameSnapshot,
    issuedAt: certificate.issuedAt,
    artifactUrl: certificate.artifactUrl,
  } };
}
