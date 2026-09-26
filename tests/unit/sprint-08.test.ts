import assert from "node:assert/strict";
import test from "node:test";

import { DeliveryStatus } from "../../src/generated/prisma/enums.ts";
import { deliveryQueueLabel, deriveProviderLabel, readableOperationalError, readableStatus } from "../../src/lib/dashboard/presentation.ts";
import { normalizeVerificationCode } from "../../src/lib/verification/code.ts";

test("verification input accepts a pasted code, label, or verification link", () => {
  const code = "05a86883-88b0-4abe-b668-a3cce4b2d03c";
  assert.equal(normalizeVerificationCode(` Verification code: ${code.toUpperCase()} `), code);
  assert.equal(normalizeVerificationCode(`http://localhost:3000/verify/${code}?source=email`), code);
});

test("delivery queue labels are derived without exposing raw queue internals", () => {
  assert.equal(deliveryQueueLabel({ status: DeliveryStatus.PENDING, hasPrimaryQueue: true, hasRetryQueue: false, hasOpenDeadLetter: false }), "Primary Queue");
  assert.equal(deliveryQueueLabel({ status: DeliveryStatus.RETRY_PENDING, hasPrimaryQueue: false, hasRetryQueue: true, hasOpenDeadLetter: false }), "Retry Queue");
  assert.equal(deliveryQueueLabel({ status: DeliveryStatus.DEAD, hasPrimaryQueue: false, hasRetryQueue: false, hasOpenDeadLetter: true }), "Dead Letter Queue");
  assert.equal(deliveryQueueLabel({ status: DeliveryStatus.SENT, hasPrimaryQueue: false, hasRetryQueue: false, hasOpenDeadLetter: false }), "Accepted by provider");
});

test("provider health distinguishes unavailable and rate-limited routes", () => {
  const now = new Date("2026-09-25T10:00:00.000Z");
  const base = { configured: true, unhealthyUntil: null, sendCount: 1, sendLimit: 100, windowStartedAt: now, windowSendCount: 1, rateLimitPerMinute: 10 };
  assert.equal(deriveProviderLabel(base, now), "Healthy");
  assert.equal(deriveProviderLabel({ ...base, configured: false }, now), "Not configured");
  assert.equal(deriveProviderLabel({ ...base, unhealthyUntil: new Date(now.getTime() + 60_000) }, now), "Temporarily unavailable");
  assert.equal(deriveProviderLabel({ ...base, windowSendCount: 10 }, now), "Rate limited");
});

test("dashboard labels turn operational enums and errors into readable text", () => {
  assert.equal(readableStatus("PARTIAL_FAILURE"), "Completed with failures");
  assert.equal(readableStatus("RETRY_PENDING"), "Retrying");
  assert.equal(readableOperationalError("PARTICIPANT_NOT_ELIGIBLE", null), "The participant is no longer eligible for a certificate.");
});
