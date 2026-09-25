# Sprint 04 — PostgreSQL Job Infrastructure & Worker Runtime

## Objective

Implement the durable asynchronous job-processing foundation for NameFrame.

This sprint should deliver:

- PostgreSQL-backed certificate job processing
- Vercel-triggered worker functions
- safe concurrent job claiming
- maximum 5 jobs claimed per worker invocation
- retry scheduling
- stale-job recovery
- dead-letter behavior using job state
- manual retry foundation
- bulk operation creation
- idempotent bulk job creation
- crash-safe worker execution
- structured job logging
- protected internal worker endpoints
- sprint-end Vercel production validation

Do not implement Cloudinary certificate generation, QR generation, email delivery, provider routing, or verification in this sprint.

The worker should use a stub/no-op processor so the infrastructure can be validated independently from later certificate-generation logic.

Refer to `AGENTS.md` before implementation.

---

# 1. Core Principle

Certificate processing must not depend on process memory.

The database is the durable source of truth.

The job system must remain correct if:

- a Vercel function crashes
- a request times out
- two worker invocations run concurrently
- a job is retried
- a worker dies after claiming work
- the client repeats a bulk-send request
- some jobs succeed while others fail

Do not create Redis, RabbitMQ, Kafka, SQS, or another queue service in Sprint 04.

PostgreSQL is the queue for the current scale.

---

# 2. Worker Execution Environment

Workers run through Vercel-triggered functions.

Use an internal endpoint or route intended for:

- Vercel Cron
- controlled internal execution
- manual development invocation when authorized

Example concept:

```text
POST /api/internal/workers/certificates
```

or:

```text
GET /api/cron/certificates/process
```

Follow the existing Next.js routing conventions.

Do not expose worker processing as a normal public API.

---

# 3. Worker Endpoint Protection

Protect worker endpoints using an internal secret.

Use an environment variable such as:

```text
CRON_SECRET
```

Requests without the correct secret must fail.

Do not log the secret.

Do not return it to the client.

Do not rely on obscurity of the route path as protection.

---

# 4. Maximum Work Per Invocation

A certificate worker invocation may claim at most:

```text
5 jobs
```

This is a hard upper bound for Sprint 04.

A worker invocation may claim fewer if fewer eligible jobs exist.

Do not dynamically increase the batch size during this sprint.

The batch size should remain configurable internally, but default/max should be 5.

---

# 5. No Job Priority

Do not introduce priority classes for:

- individual sends
- bulk sends
- retry jobs

All eligible certificate jobs use the same queue semantics.

Do not add:

```text
HIGH
NORMAL
LOW
```

or similar priority enums.

Keep the queue model simple.

---

# 6. Certificate Job States

Use the Sprint 01 state model:

```text
PENDING
PROCESSING
RETRY_PENDING
COMPLETED
DEAD
```

## PENDING

Job is ready for first processing.

## PROCESSING

Job has been claimed by a worker and is currently being processed.

## RETRY_PENDING

A retryable failure occurred.

The job is waiting until its retry time.

## COMPLETED

Processing succeeded.

## DEAD

Automatic retries are exhausted or the job failed permanently.

Do not add a generic `FAILED` state.

---

# 7. Add Retry Scheduling Metadata

Sprint 01 intentionally deferred delayed retry timing.

Sprint 04 should add:

```text
nextAttemptAt
```

to `CertificateJob`.

This field may be nullable.

Meaning:

```text
PENDING
→ immediately eligible

RETRY_PENDING + nextAttemptAt <= now
→ eligible

RETRY_PENDING + nextAttemptAt > now
→ not eligible
```

Create a migration for this change.

---

# 8. Job Metadata

A certificate job should support at minimum:

```text
id
eventId
participantId
bulkOperationId?

status

attemptCount
maxAttempts
nextAttemptAt?

claimedAt?
claimedBy?
startedAt?
completedAt?

lastErrorCode?
lastErrorMessage?

createdAt
updatedAt
deletedAt?
```

Use timestamps rather than storing duplicated duration values.

---

# 9. Maximum Attempts

Default:

```text
maxAttempts = 6
```

The retry system should use this value rather than scattering hardcoded `6` checks throughout the code.

The field should remain configurable at the job level if already defined that way.

---

# 10. Attempt Counting

Increment:

```text
attemptCount
```

when actual processing begins.

Do not increment merely because a worker inspected or selected the row.

Typical flow:

```text
Claim job
    ↓
Begin processing
    ↓
attemptCount += 1
    ↓
Execute processor
```

Ensure failed processing still records the attempt.

---

# 11. Job Claiming

Multiple workers may execute concurrently.

Use PostgreSQL row-level locking with semantics equivalent to:

```sql
FOR UPDATE SKIP LOCKED
```

The exact Prisma/raw-SQL implementation may vary.

The important guarantees are:

- a job is claimed by at most one active worker
- workers do not block each other unnecessarily
- each invocation claims no more than 5 jobs
- claiming is atomic

---

# 12. Claim Transaction Boundary

Keep the claim transaction short.

Correct conceptual flow:

```text
BEGIN TRANSACTION
    ↓
Select eligible jobs with row locking
    ↓
Mark them PROCESSING
    ↓
Set claimedAt
    ↓
Set claimedBy
COMMIT

External processing starts afterward
```

Do not perform Cloudinary/network/external work while holding the database transaction open.

Long-running work inside the transaction is forbidden.

---

# 13. Worker Identity

Every worker invocation should create a unique worker identifier.

Use a random UUID or equivalent safe unique identifier.

Example:

```text
workerId = UUID
```

Persist it into:

```text
claimedBy
```

for every job claimed by that invocation.

Structured logs should also contain the same worker ID.

---

# 14. Eligible Job Query

Jobs are eligible when:

```text
status = PENDING
```

or:

```text
status = RETRY_PENDING
AND nextAttemptAt <= now
```

Soft-deleted jobs must never be claimed.

Jobs whose related event/participant is no longer operational must be handled safely and not processed blindly.

---

# 15. Ordering

Use simple FIFO-style ordering.

Recommended:

```text
ORDER BY createdAt ASC
```

for eligible jobs.

Do not implement priority scheduling.

Retry jobs become eligible based on `nextAttemptAt` and then participate in the same normal ordering.

---

# 16. Stale PROCESSING Recovery

A Vercel function may crash after claiming a job.

A job must not remain stuck forever in:

```text
PROCESSING
```

Treat a processing job as stale when:

```text
claimedAt < now - 5 minutes
```

Default stale timeout:

```text
5 minutes
```

When a stale job is detected:

- do not assume it completed
- reset it safely for retry
- preserve previous error/attempt metadata
- record a useful recovery reason if needed

Suggested transition:

```text
PROCESSING
    ↓ stale
RETRY_PENDING
```

Then assign an appropriate `nextAttemptAt`.

Do not immediately mark stale jobs DEAD unless retry limits are exhausted.

---

# 17. Retry Timing

Use increasing backoff.

Recommended initial schedule:

```text
Retry 1 → 30 seconds
Retry 2 → 2 minutes
Retry 3 → 10 minutes
Retry 4 → 20 minutes
Retry 5 → 30 minutes
```

Exact implementation may use a small deterministic helper.

Do not busy-loop RETRY_PENDING jobs.

---

# 18. Retry Transition

On retryable failure:

```text
PROCESSING
    ↓
attemptCount checked
    ↓
if attempts remain
    ↓
RETRY_PENDING
```

Update:

```text
nextAttemptAt
lastErrorCode
lastErrorMessage
claimedAt = null if appropriate
claimedBy = null if appropriate
completedAt = null
```

Preserve failure history through logs and job metadata.

---

# 19. Permanent Failure

If a processor returns a non-retryable error:

```text
PROCESSING
    ↓
DEAD
```

Update:

```text
lastErrorCode
lastErrorMessage
completedAt
```

Do not consume remaining retries for obviously permanent failures.

Examples later may include:

```text
missing participant
missing template
invalid template configuration
invalid event state
```

---

# 20. Retry Exhaustion

If:

```text
attemptCount >= maxAttempts
```

after a failed attempt:

```text
PROCESSING
    ↓
DEAD
```

Do not create a separate physical DLQ table.

`DEAD` is the database-backed DLQ state.

---

# 21. DLQ / Dead Job Behavior

Dead jobs remain in the existing:

```text
CertificateJob
```

table.

Do not move rows to another table.

Dead jobs must remain inspectable for:

- debugging
- dashboard reporting
- manual retry
- auditability

Completed/dead job cleanup is out of scope for Sprint 04.

---

# 22. Manual Retry Foundation

Provide an application/service-layer operation that can retry a `DEAD` job.

Suggested behavior:

```text
DEAD
    ↓ authorized manual retry
PENDING
```

Reset processing fields required for a clean retry.

Do not build a polished manual-retry UI in Sprint 04.

---

# 23. Processor Abstraction

Create a small processor contract for certificate jobs.

Conceptually:

```text
processCertificateJob(job)
```

The processor should return or throw structured outcomes classifiable as:

```text
SUCCESS
RETRYABLE_FAILURE
PERMANENT_FAILURE
```

Do not build an unnecessary provider/factory hierarchy.

---

# 24. Stub Processor

Sprint 04 should use a deterministic stub/no-op processor.

Purpose:

- validate queue behavior
- validate concurrency
- validate retries
- validate state transitions
- validate stale recovery
- validate bulk progress

Do not implement actual Cloudinary certificate generation yet.

---

# 25. Bulk Operation Creation

Implement the service-layer foundation for bulk certificate work.

Conceptual flow:

```text
User requests bulk processing
        ↓
Validate organization membership
        ↓
Validate event
        ↓
Select eligible participants
        ↓
Create BulkOperation
        ↓
Create N CertificateJobs
```

Only participants where:

```text
eligibleForCertificate = true
```

may receive jobs.

Do not include soft-deleted participants.

---

# 26. Bulk Creation Transaction

Bulk operation creation must be atomic.

```text
BEGIN
Create BulkOperation
Create all child CertificateJobs
COMMIT
```

If child-job creation fails:

```text
ROLLBACK
```

Do not leave partially-created bulk operations.

---

# 27. Bulk Operation Idempotency

Protect bulk operation creation from client retries and double clicks.

Use an idempotency identifier such as:

```text
operationRequestId
```

A repeated request with the same idempotency key must not create duplicate:

- BulkOperation records
- CertificateJobs

Enforce this safely at the database/application layer, not only in browser state.

---

# 28. Single Job Idempotency

Prevent accidental duplicate active certificate-generation work for the same logical request.

Do not permanently ban a participant from future re-sends.

The idempotency rule must protect the request/operation, not the participant forever.

Document the exact key/constraint chosen in `current.md`.

---

# 29. Bulk Operation Progress

Prefer deriving operational progress from child jobs.

Example:

```text
total = COUNT(all child jobs)
completed = COUNT(status = COMPLETED)
dead = COUNT(status = DEAD)
processing = COUNT(status = PROCESSING)
pending = COUNT(status IN PENDING, RETRY_PENDING)
```

Do not rely on manually-maintained counters as the sole source of truth.

---

# 30. Bulk Operation State Derivation

Suggested behavior:

```text
all jobs pending
→ PENDING

any active processing
→ PROCESSING

all completed
→ COMPLETED

some completed + some dead, none active
→ PARTIAL_FAILURE

all dead, none completed
→ FAILED
```

Do not mark a whole bulk operation failed because one child job fails.

---

# 31. Single-Send Job Creation

Support creating one certificate job without a parent bulk operation.

```text
bulkOperationId = null
```

Single and bulk jobs must use the same worker pipeline.

---

# 32. Worker Invocation Flow

Each invocation should roughly behave as:

```text
Validate CRON_SECRET
        ↓
Generate workerId
        ↓
Recover stale jobs
        ↓
Claim up to 5 eligible jobs
        ↓
For each claimed job
        ↓
Start processing
        ↓
Increment attemptCount
        ↓
Call processor
        ↓
Success / Retry / Dead
        ↓
Persist state
        ↓
Structured log
        ↓
Return summary
```

Failure of one job must not stop the remaining claimed jobs.

---

# 33. Per-Job Isolation

If five jobs are claimed:

```text
Job 1 succeeds
Job 2 retries
Job 3 succeeds
Job 4 dies permanently
Job 5 succeeds
```

persist those results independently.

Do not wrap all five processing operations in one transaction.

---

# 34. Structured Logging

Every processing attempt should log useful structured metadata.

At minimum:

```text
workerId
jobId
eventId
participantId
bulkOperationId if present
attemptNumber
previousStatus
newStatus
startedAt
completedAt
duration
errorCode if present
```

Do not log secrets or raw credentials.

Avoid logging participant email unless genuinely necessary.

---

# 35. Worker Response

Return a concise operational summary.

Example:

```json
{
  "claimed": 5,
  "completed": 3,
  "retryPending": 1,
  "dead": 1
}
```

Do not expose stack traces.

---

# 36. Concurrency

Multiple Vercel worker invocations must run safely at the same time.

Prevent:

- duplicate claims
- double completion
- one worker overwriting another worker's active claim
- stale workers overwriting newer claims

Use expected-state/ownership checks where appropriate.

---

# 37. Worker Ownership Safety

When finishing a `PROCESSING` job, verify the job is still owned by the current worker where practical:

```text
claimedBy = currentWorkerId
```

Do not blindly update by `jobId` alone after long-running work.

---

# 38. Heartbeats

Do not implement worker heartbeats.

Use:

```text
claimedAt + 5-minute stale timeout
```

for crash recovery.

---

# 39. Error Classification

Worker processing must distinguish:

```text
RETRYABLE
NON_RETRYABLE
```

Use the structured error model from Sprint 01.

Actual Cloudinary-specific failure classification arrives in Sprint 05.

---

# 40. Database Indexes

Review/add indexes supporting worker queries.

At minimum inspect:

```text
CertificateJob.status
CertificateJob.nextAttemptAt
CertificateJob.createdAt
CertificateJob.eventId
CertificateJob.bulkOperationId
CertificateJob.claimedAt
```

A useful composite index may include:

```text
(status, nextAttemptAt, createdAt)
```

Validate against the real claim query rather than adding indexes ceremonially.

---

# 41. No Long-Lived Worker Server

Do not create:

- separate Express worker server
- persistent Node worker process
- PM2 worker
- Kubernetes deployment
- dedicated always-on worker host

Sprint 04 targets Vercel-triggered functions.

Keep the core worker services portable enough to move to dedicated workers later.

---

# 42. No External Queue

Do not add:

```text
Redis
BullMQ
RabbitMQ
SQS
Kafka
```

PostgreSQL remains the durable queue.

---

# 43. Internal Service Boundaries

Keep responsibilities reasonably separated:

```text
Job Repository
    ↓
claim / retry / state persistence

Certificate Job Service
    ↓
create jobs / bulk creation / manual retry

Certificate Worker
    ↓
claim + orchestrate processing

Certificate Processor
    ↓
per-job business processing
```

Do not turn the route handler into the entire queue implementation.

Do not build a generic job framework either.

---

# 44. Internal Route Surface

Suggested internal worker route:

```text
POST /api/internal/workers/certificates
```

or the equivalent Vercel cron route.

Possible application/service endpoints:

```text
POST /api/events/:eventId/certificate-jobs
POST /api/events/:eventId/bulk-operations
POST /api/certificate-jobs/:jobId/retry
```

A polished public UI is not required yet.

---

# 45. Out of Scope

Do not implement in Sprint 04:

- Cloudinary certificate generation
- certificate artifact creation
- QR generation
- verification codes
- delivery job creation from successful generation
- email sending
- Resend
- SMTP
- SendGrid
- provider fallback
- delivery webhooks
- dashboard UI
- job priority
- per-event concurrency limits
- worker heartbeats
- external queue infrastructure
- completed-job cleanup policy

---

# 46. Sprint-End Tests

At sprint completion test:

- Prisma schema validation
- migration for retry/idempotency metadata
- TypeScript checks
- linting
- production build
- Vercel-compatible build
- CRON_SECRET protection
- job claim limit of 5
- concurrent worker claims
- SKIP LOCKED behavior
- FIFO ordering
- retry scheduling
- max-attempt transition to DEAD
- permanent failure transition to DEAD
- stale PROCESSING recovery
- worker ownership validation
- manual retry foundation
- atomic bulk-operation creation
- bulk request idempotency
- duplicate-job protection
- aggregate bulk-state derivation
- one failed job does not stop the remaining jobs

---

# 47. Required Concurrency Test

Create at least:

```text
10 PENDING jobs
```

Trigger two workers concurrently.

Expected:

```text
Worker A claims <= 5
Worker B claims different <= 5
No job claimed twice
```

Verify ownership and final states.

---

# 48. Required Crash-Recovery Test

Simulate:

```text
Job → PROCESSING
claimedAt older than 5 minutes
worker never completed
```

Expected recovery:

```text
PROCESSING
→ RETRY_PENDING
```

The job should later become eligible again.

---

# 49. Required Retry Test

Simulate deterministic processor failures.

Expected lifecycle:

```text
PENDING
→ PROCESSING
→ RETRY_PENDING

retry due
→ PROCESSING
→ RETRY_PENDING

...

maxAttempts reached
→ DEAD
```

Verify:

```text
attemptCount
nextAttemptAt
lastErrorCode
lastErrorMessage
```

remain correct.

---

# 50. Required Bulk Test

Create a bulk operation for eligible participants.

Verify:

```text
1 BulkOperation
+
N CertificateJobs
```

are created atomically.

Repeat the same request with the same idempotency key.

Expected:

```text
no duplicate BulkOperation
no duplicate child jobs
```

---

# 51. `current.md` Updates

Examples:

```text
- Added PostgreSQL-backed certificate worker.
- Worker claims a maximum of 5 jobs per invocation.
- Added row-locking claim logic using SKIP LOCKED semantics.
- Added nextAttemptAt and retry backoff.
- Added 5-minute stale PROCESSING recovery.
- Added maxAttempts=6 default.
- DEAD state acts as database-backed DLQ.
- Added manual retry service.
- Added atomic BulkOperation + child job creation.
- Added bulk-operation idempotency protection.
- Internal worker route protected by CRON_SECRET.
- Concurrent worker tests pass.
- Sprint 04 Vercel production build passes.
```

Do not duplicate this whole specification into `current.md`.

---

# 52. Completion Condition

Sprint 04 is complete when NameFrame has a durable worker foundation capable of:

```text
Create certificate jobs
        ↓
Persist them in PostgreSQL
        ↓
Vercel function invoked
        ↓
Claim maximum 5 jobs safely
        ↓
Process independently
        ↓
Complete / retry / dead
        ↓
Recover stale work
        ↓
Support multiple concurrent workers
        ↓
Preserve diagnostic metadata
```

After Sprint 04, Sprint 05 can replace the stub processor with real certificate generation without redesigning the queue or worker lifecycle.
