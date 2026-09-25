import assert from "node:assert/strict";
import test from "node:test";

import { OrganizationRole } from "../../src/generated/prisma/enums.ts";
import { requireGroupLeader, requireSameOrganization } from "../../src/lib/auth/permissions.ts";
import { errorResponse } from "../../src/lib/errors/http.ts";
import { isAuthorizedHealthRequest } from "../../src/lib/health/auth.ts";
import { buildHealthReport, configuredServiceStatuses } from "../../src/lib/health/service.ts";
import { consumeRateLimit, resetRateLimitsForTests } from "../../src/lib/security/rate-limit.ts";

test("event and send rate limits reject requests above their configured window", () => {
  resetRateLimitsForTests();
  consumeRateLimit({ key: "user-1", scope: "event", limit: 2, windowMs: 1_000, now: 100 });
  consumeRateLimit({ key: "user-1", scope: "event", limit: 2, windowMs: 1_000, now: 200 });
  assert.throws(
    () => consumeRateLimit({ key: "user-1", scope: "event", limit: 2, windowMs: 1_000, now: 300 }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "RATE_LIMITED",
  );

  consumeRateLimit({ key: "user-1", scope: "event", limit: 2, windowMs: 1_000, now: 1_100 });
  consumeRateLimit({ key: "user-1", scope: "send", limit: 1, windowMs: 1_000, now: 1_100 });
  assert.throws(() => consumeRateLimit({ key: "user-1", scope: "send", limit: 1, windowMs: 1_000, now: 1_101 }));
});

test("health authorization requires an exact bearer secret", () => {
  const request = (value?: string) => new Request("http://localhost/api/internal/health", {
    headers: value ? { authorization: value } : undefined,
  });

  assert.equal(isAuthorizedHealthRequest(request(), "health-secret"), false);
  assert.equal(isAuthorizedHealthRequest(request("Bearer wrong"), "health-secret"), false);
  assert.equal(isAuthorizedHealthRequest(request("Bearer health-secret"), "health-secret"), true);
  assert.equal(isAuthorizedHealthRequest(request("Bearer health-secret"), undefined), false);
});

test("health reports database failure without exposing diagnostics", async () => {
  const report = await buildHealthReport(
    async () => { throw new Error("postgres://user:password@example.test/private"); },
    { CLOUDINARY_CLOUD_NAME: "cloud", CLOUDINARY_API_KEY: "key", CLOUDINARY_API_SECRET: "secret" },
  );

  assert.equal(report.status, "degraded");
  assert.equal(report.services.database, "unhealthy");
  assert.equal(report.services.cloudinary, "configured");
  assert.doesNotMatch(JSON.stringify(report), /password|private|secret/);
});

test("service configuration is reported only as safe status values", () => {
  const statuses = configuredServiceStatuses({
    SITE_SMTP_HOST: "smtp.example.test",
    SITE_SMTP_USERNAME: "user",
    SITE_SMTP_PASSWORD: "password",
    SITE_SMTP_FROM_EMAIL: "sender@example.test",
    RESEND_API_KEY: "resend-secret",
    RESEND_FROM_EMAIL: "sender@example.test",
  });
  assert.deepEqual(statuses, { cloudinary: "not_configured", smtp: "configured", resend: "configured" });
  assert.doesNotMatch(JSON.stringify(statuses), /password|resend-secret/);
});

test("organization and leader authorization continue to reject cross-boundary access", () => {
  const member = { userId: "user-1", organizationId: "organization-1", role: OrganizationRole.GROUP_MEMBER };
  assert.throws(() => requireSameOrganization(member, "organization-2"));
  assert.throws(() => requireGroupLeader(member));
  assert.doesNotThrow(() => requireSameOrganization(member, "organization-1"));
});

test("unexpected API errors do not expose their original message", async () => {
  const response = errorResponse(new Error("HEALTH_CHECK_SECRET=do-not-leak"));
  assert.equal(response.status, 500);
  assert.doesNotMatch(await response.text(), /do-not-leak|HEALTH_CHECK_SECRET/);
});
