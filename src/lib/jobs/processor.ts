import type { CertificateJob } from "@/generated/prisma/client";

export type CertificateJobOutcome =
  | {
      type: "SUCCESS";
      completedByProcessor?: boolean;
      certificateId?: string;
      deliveryId?: string;
      reused?: boolean;
      cloudinaryPublicId?: string;
    }
  | { type: "RETRYABLE_FAILURE"; code: string; message: string }
  | { type: "PERMANENT_FAILURE"; code: string; message: string };

export type CertificateJobProcessor = (
  job: CertificateJob,
  context: { workerId: string },
) => Promise<CertificateJobOutcome>;

export const processCertificateJobStub: CertificateJobProcessor = async () => ({ type: "SUCCESS" });
