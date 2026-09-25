import "dotenv/config";

import assert from "node:assert/strict";

import { GET as healthCheck } from "../src/app/api/internal/health/route.ts";
import { POST as certificateWorker } from "../src/app/api/internal/workers/certificates/route.ts";
import { POST as primaryDeliveryWorker } from "../src/app/api/internal/workers/delivery-primary/route.ts";
import { POST as retryDeliveryWorker } from "../src/app/api/internal/workers/delivery-retry/route.ts";

const originalHealthSecret = process.env.HEALTH_CHECK_SECRET;
const originalCronSecret = process.env.CRON_SECRET;
process.env.HEALTH_CHECK_SECRET = "sprint-nine-health-secret";
process.env.CRON_SECRET = "sprint-nine-worker-secret";

try {
  const unauthorizedHealth = await healthCheck(new Request("http://localhost/api/internal/health"));
  assert.equal(unauthorizedHealth.status, 401);

  const health = await healthCheck(new Request("http://localhost/api/internal/health", {
    headers: { authorization: `Bearer ${process.env.HEALTH_CHECK_SECRET}` },
  }));
  assert.equal(health.status, 200);
  const healthBody = await health.text();
  assert.match(healthBody, /"database":"healthy"/);
  assert.doesNotMatch(healthBody, /sprint-nine-health-secret|DATABASE_URL|API_SECRET|API_KEY|PASSWORD/);

  const invalidWorkerRequest = () => new Request("http://localhost/api/internal/workers/test", {
    method: "POST",
    headers: { authorization: "Bearer invalid-secret" },
  });
  for (const worker of [certificateWorker, primaryDeliveryWorker, retryDeliveryWorker]) {
    const response = await worker(invalidWorkerRequest());
    assert.equal(response.status, 401);
    assert.doesNotMatch(await response.text(), /sprint-nine-worker-secret/);
  }

  console.log("Sprint 09 integration verification passed.");
} finally {
  if (originalHealthSecret === undefined) delete process.env.HEALTH_CHECK_SECRET;
  else process.env.HEALTH_CHECK_SECRET = originalHealthSecret;
  if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalCronSecret;
}
