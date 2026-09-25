import {
  BulkOperationStatus,
  CertificateJobStatus,
  DeliveryStatus,
} from "@/generated/prisma/enums";

export type DeliveryQueueSnapshot = {
  status: DeliveryStatus;
  hasPrimaryQueue: boolean;
  hasRetryQueue: boolean;
  hasOpenDeadLetter: boolean;
};

export function deliveryQueueLabel(snapshot: DeliveryQueueSnapshot) {
  if (snapshot.status === DeliveryStatus.SENT) return "Accepted by provider";
  if (snapshot.status === DeliveryStatus.DELIVERED) return "Delivered";
  if (snapshot.hasOpenDeadLetter || snapshot.status === DeliveryStatus.DEAD) return "Dead Letter Queue";
  if (snapshot.hasRetryQueue || snapshot.status === DeliveryStatus.RETRY_PENDING) return "Retry Queue";
  if (snapshot.hasPrimaryQueue) return "Primary Queue";
  return snapshot.status === DeliveryStatus.PROCESSING ? "Processing" : "Pending";
}

export function readableStatus(status: string) {
  const labels: Record<string, string> = {
    [BulkOperationStatus.PARTIAL_FAILURE]: "Completed with failures",
    [CertificateJobStatus.RETRY_PENDING]: "Retrying",
    [DeliveryStatus.SENT]: "Provider accepted",
    [DeliveryStatus.DELIVERED]: "Delivered",
    [DeliveryStatus.PENDING]: "Waiting for provider",
  };
  return labels[status] ?? status.toLowerCase().replaceAll("_", " ").replace(/^./, (value) => value.toUpperCase());
}

export function readableOperationalError(code: string | null, fallback: string | null) {
  if (!code) return fallback;
  const labels: Record<string, string> = {
    EVENT_TEMPLATE_MISSING: "The certificate template is missing.",
    TEMPLATE_REQUIRED: "The certificate template is missing.",
    PARTICIPANT_NOT_ELIGIBLE: "The participant is no longer eligible for a certificate.",
    SMTP_CONNECTION_FAILED: "The SMTP provider could not be reached.",
    EMAIL_PROVIDER_RATE_LIMITED: "The email provider is temporarily rate limited.",
    EMAIL_PROVIDER_RATE_LIMIT: "The email provider is temporarily rate limited.",
    EMAIL_PROVIDER_UNAVAILABLE: "The email provider is temporarily unavailable.",
    SMTP_NOT_CONFIGURED: "Configure SMTP before sending certificates.",
  };
  return labels[code] ?? fallback ?? "The operation failed. Review the error code for troubleshooting.";
}

export function deriveProviderLabel(input: {
  configured: boolean;
  unhealthyUntil: Date | null;
  sendCount: number;
  sendLimit: number;
  windowStartedAt: Date | null;
  windowSendCount: number;
  rateLimitPerMinute: number;
}, now = new Date()) {
  if (!input.configured) return "Not configured";
  if (input.unhealthyUntil && input.unhealthyUntil > now) return "Temporarily unavailable";
  const activeWindow = input.windowStartedAt && now.getTime() - input.windowStartedAt.getTime() < 60_000;
  if (input.sendCount >= input.sendLimit || (activeWindow && input.windowSendCount >= input.rateLimitPerMinute)) {
    return "Rate limited";
  }
  return "Healthy";
}
