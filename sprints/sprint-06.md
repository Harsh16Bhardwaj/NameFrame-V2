# Sprint 06 — Email Delivery, Retry Queue & DLQ

## Objective

Implement the real email-delivery pipeline for certificates issued in Sprint 05.

This sprint must deliver:

- PostgreSQL-backed primary delivery queue
- separate PostgreSQL-backed retry queue
- separate database-backed dead-letter queue (DLQ)
- Vercel-triggered primary delivery worker
- Vercel-triggered retry worker
- maximum 5 deliveries claimed per worker invocation
- organization SMTP support through Nodemailer
- site SMTP fallback configuration through environment variables
- Resend fallback provider
- exactly 2 primary attempts + 2 backup attempts
- SMTP credential validation
- provider health tracking
- provider rate-limit tracking
- per-minute provider limits
- SMTP send-count/send-limit protection
- certificate link in every email
- certificate PNG attachment when safely possible
- delivery attempt history
- manual retry from DEAD/DLQ
- structured errors and logs
- sprint-end Vercel production validation

Do not implement bounce tracking, delivery webhooks, open tracking, click tracking, or an UNKNOWN delivery state in this sprint.

Refer to `AGENTS.md` before implementation.

---

## 1. Core Delivery Architecture

Sprint 05 creates:

```text
Certificate
    ↓
Delivery (PENDING)
```

Sprint 06 adds explicit queue infrastructure:

```text
Delivery
    ↓
Primary Delivery Queue
    ↓
Primary Worker
    ↓
Attempt 1
    ↓ failure
Attempt 2
    ↓ failure
Retry Queue
    ↓
Retry Worker
    ↓
Backup Attempt 1
    ↓ failure
Backup Attempt 2
    ↓ failure
DLQ
```

Maximum automatic send attempts:

```text
4
```

Split as:

```text
2 primary-provider attempts
+
2 backup-provider attempts
```

After that:

```text
Delivery → DEAD
```

Only manual retry may restart the delivery.

---

## 2. Structurally Separate Queues

Use separate PostgreSQL-backed structures:

```text
PrimaryDeliveryQueueItem
RetryDeliveryQueueItem
DeliveryDeadLetter
```

The canonical business entity remains:

```text
Delivery
```

Queue rows reference `deliveryId` and only store scheduling/processing metadata needed by that queue.

Do not duplicate the full Delivery business record into queue tables.

This separation is intentional. Primary and retry processing use different workers and may use different providers.

---

## 3. Serverless Worker Model

Workers are Vercel-triggered functions.

There is no permanently running in-memory listener.

```text
Vercel trigger
    ↓
function invocation starts
    ↓
claim up to 5 DB queue rows
    ↓
process independently
    ↓
persist results
    ↓
function invocation ends
```

The primary worker must not synchronously call the retry worker.

On retry promotion:

```text
Primary worker
    ↓
atomically inserts RetryDeliveryQueueItem
    ↓
finishes invocation
```

A separate Vercel trigger later executes the retry worker.

---

## 4. Worker Endpoints

Use separate protected routes, conceptually:

```text
POST /api/internal/workers/delivery-primary
POST /api/internal/workers/delivery-retry
```

or equivalent Vercel cron routes.

Both must require `CRON_SECRET`.

Never expose them as ordinary public APIs.

---

## 5. Worker Claim Limit

Each invocation may claim at most:

```text
5 queue items
```

Use the safe PostgreSQL claiming pattern established in Sprint 04:

```sql
FOR UPDATE SKIP LOCKED
```

or equivalent semantics.

Primary and retry workers claim only from their own queue tables.

---

## 6. Delivery States Used in This Sprint

Actively use:

```text
PENDING
PROCESSING
RETRY_PENDING
SENT
DEAD
```

If `DELIVERED` or `BOUNCED` already exist in the schema, leave them unused for now.

Do not add `UNKNOWN`.

`SENT` means the provider accepted the email. It does not claim final delivery to the recipient.

---

## 7. Primary Provider Resolution

Resolve the primary sending route in this order:

```text
1. Organization SMTP
2. Site SMTP
3. Resend
```

### Organization SMTP

Use organization SMTP when it is:

- configured
- active
- healthy
- within send limits
- within per-minute rate limits

### Site SMTP

If the organization has no usable SMTP configuration, use server-controlled site SMTP configured through environment variables.

### Resend

If neither SMTP route is usable, use Resend.

Never allow the client to choose another organization's SMTP credentials.

---

## 8. Backup Provider

After two failed attempts on the primary route:

```text
move Delivery to Retry Queue
```

For SMTP primary routes:

```text
backup provider = Resend
```

If Resend was already the primary route because SMTP was unavailable, the retry queue still owns the remaining two bounded attempts using the available route.

Do not add SendGrid in Sprint 06 unless already present at effectively zero implementation cost.

---

## 9. Organization SMTP Configuration

SMTP configuration belongs to the organization.

Required fields should include:

```text
id
organizationId
label
host
port
username
encryptedPassword
fromName
fromEmail
secure
active
sendCount
sendLimit
rateLimitPerMinute
createdAt
updatedAt
deletedAt?
```

Credentials must be encrypted at rest.

Never store the SMTP password in plaintext.

Never return plaintext or encrypted password values to ordinary browser responses.

---

## 10. SMTP Credentials and Gmail-style App Passwords

For providers such as Gmail SMTP, configuration commonly uses:

```text
email / username
+
app password
```

A generated app password should be used rather than the account's normal password where the provider requires it.

Also store/configure:

```text
host
port
secure/TLS setting
```

Do not hardcode Gmail assumptions for every SMTP provider.

---

## 11. SMTP Connection Validation

When the organization saves or updates SMTP credentials:

```text
validate fields
    ↓
test SMTP connection
    ↓
success?
    ├── yes → encrypt + persist + activate
    └── no  → reject or leave inactive
```

Use Nodemailer's verification mechanism or equivalent.

Return a structured error such as:

```text
SMTP_CONFIGURATION_INVALID
```

Do not activate credentials that fail validation.

---

## 12. Site SMTP

Site SMTP credentials live in server-only environment/configuration values, such as:

```text
SITE_SMTP_HOST
SITE_SMTP_PORT
SITE_SMTP_USERNAME
SITE_SMTP_PASSWORD
SITE_SMTP_FROM_EMAIL
SITE_SMTP_FROM_NAME
```

Do not expose these to browser code.

Mutable health/rate-limit counters for site SMTP must be persisted in PostgreSQL.

---

## 13. Provider Adapter Boundary

Use a simple normalized abstraction:

```text
EmailProviderAdapter
    send(message)
```

Implement:

```text
SmtpEmailProvider
ResendEmailProvider
```

Do not scatter Nodemailer or Resend-specific business logic throughout worker code.

---

## 14. Normalized Email Message

Provider adapters receive a shared message shape containing approximately:

```text
to
fromName
fromEmail
subject
html/text body
certificateUrl
attachment if available
```

Provider-specific request structures should remain inside adapters.

---

## 15. Email Content

Use a simple shared email structure containing:

```text
organization identity
event title
configured email body
certificate link
```

Use the immutable Delivery snapshots created in Sprint 05:

```text
recipientEmail
emailSubject
emailBody
```

Do not read mutable live event email text during worker execution.

---

## 16. Certificate Link

Every email must include a direct link to the issued certificate using:

```text
Certificate.artifactUrl
```

Do not regenerate certificates in the delivery worker.

---

## 17. Certificate Attachment

Attempt to attach the generated PNG where practical.

```text
artifactUrl
    ↓
fetch PNG bytes
    ↓
attachment available?
    ├── yes → send link + attachment
    └── no  → send link only
```

Attachment retrieval failure must not fail the whole email if the valid certificate link is available.

Apply a safe size limit for attachment downloads.

---

## 18. Delivery Attempt History

Every actual provider send call creates a `DeliveryAttempt`.

Store at minimum:

```text
id
deliveryId
provider
attemptNumber
startedAt
completedAt?
providerMessageId?
errorCode?
errorMessage?
createdAt
```

Do not add a new outcome field in this sprint.

Never overwrite prior attempts.

---

## 19. Primary Queue Entity

Create something equivalent to:

```text
PrimaryDeliveryQueueItem
```

Suggested fields:

```text
id
deliveryId
attemptCount
maxAttempts = 2
claimedAt?
claimedBy?
nextAttemptAt?
lastErrorCode?
lastErrorMessage?
createdAt
updatedAt
```

Prevent duplicate active primary queue rows for the same Delivery.

---

## 20. Retry Queue Entity

Create:

```text
RetryDeliveryQueueItem
```

Suggested fields:

```text
id
deliveryId
provider
attemptCount
maxAttempts = 2
claimedAt?
claimedBy?
nextAttemptAt?
lastErrorCode?
lastErrorMessage?
createdAt
updatedAt
```

The retry worker processes only this table.

This queue means:

> Primary delivery attempts are exhausted; use the backup route.

---

## 21. Dead-Letter Queue Entity

Create:

```text
DeliveryDeadLetter
```

Suggested fields:

```text
id
deliveryId
failedProvider?
totalAttempts
lastErrorCode
lastErrorMessage
movedAt
resolvedAt?
resolvedByUserId?
createdAt
updatedAt
```

Do not delete DLQ history after manual retry.

Mark the old DLQ item resolved when manually retried.

---

## 22. Primary Worker Flow

```text
Validate CRON_SECRET
    ↓
Generate workerId
    ↓
Claim <= 5 primary queue items
    ↓
For each independently:
    ↓
Load Delivery + Certificate
    ↓
Resolve primary provider
    ↓
Check health and rate limits
    ↓
Create DeliveryAttempt
    ↓
Call provider
```

### Success

```text
Delivery → SENT
primary queue item consumed/completed
```

### First retryable failure

```text
primary attemptCount = 1
schedule primary retry
```

### Second retryable failure

```text
primary attemptCount = 2
    ↓
atomically create RetryDeliveryQueueItem
    ↓
Delivery → RETRY_PENDING
    ↓
consume primary queue item
```

### Permanent message failure

If another provider cannot meaningfully solve the failure:

```text
Delivery → DEAD
DeliveryDeadLetter created
```

---

## 23. Retry Worker Flow

```text
Validate CRON_SECRET
    ↓
Generate workerId
    ↓
Claim <= 5 retry queue items
    ↓
For each independently:
    ↓
Use backup provider
    ↓
Create DeliveryAttempt
    ↓
Send
```

### Success

```text
Delivery → SENT
retry queue item consumed
```

### First backup failure

```text
retry attemptCount = 1
schedule retry
```

### Second backup failure

```text
retry attemptCount = 2
    ↓
atomically create DeliveryDeadLetter
    ↓
Delivery → DEAD
```

Total automatic provider attempts must never exceed four for one delivery cycle.

---

## 24. Queue Promotion Must Be Atomic

Primary → Retry:

```text
BEGIN
consume/close PrimaryDeliveryQueueItem
create RetryDeliveryQueueItem
Delivery → RETRY_PENDING
COMMIT
```

Retry → DLQ:

```text
BEGIN
consume/close RetryDeliveryQueueItem
create DeliveryDeadLetter
Delivery → DEAD
COMMIT
```

Never create a gap where a delivery exists in no queue after a failed move.

---

## 25. Retry Scheduling

Use short persisted delays.

Recommended starting values:

```text
Primary retry: 30–60 seconds
Backup retry: 2–5 minutes
```

Use constants/configuration.

Do not busy-loop retries within the same invocation.

---

## 26. Provider Failure Classification

Distinguish provider failures from recipient/message failures.

### Provider/infrastructure failures

Examples:

```text
timeout
connection failure
429
provider 5xx
SMTP transport unavailable
provider auth/config failure
```

These affect provider health.

### Message/recipient failures

Examples:

```text
invalid recipient
malformed address
message-specific permanent rejection
```

These do not count toward provider-wide consecutive failure health.

---

## 27. Provider Health

Persist provider health in PostgreSQL.

A provider route becomes unhealthy after:

```text
5 consecutive provider-caused delivery failures
```

A successful provider send resets:

```text
consecutiveFailures = 0
```

While unhealthy:

```text
skip provider for new deliveries
promote next usable route
```

Use an initial cooldown of approximately:

```text
10 minutes
```

After cooldown, allow the provider to be tested again.

---

## 28. Provider Health Scope

Organization SMTP health must be scoped to that organization.

One organization's broken SMTP must not poison every organization's SMTP.

Site SMTP health is global.

Resend health is global to the configured Resend account.

---

## 29. Provider Rate Limits

Every provider route should support a configured per-minute send limit.

At minimum cover:

```text
Organization SMTP
Site SMTP
Resend
```

Persist rate-window state in PostgreSQL rather than process memory.

A generic persisted rate state may include:

```text
providerRoute
organizationId?
windowStartedAt
windowSendCount
rateLimitPerMinute
updatedAt
```

Use the simplest clean implementation that provides these guarantees.

---

## 30. SMTP Send Count and Limit

Organization SMTP also tracks:

```text
sendCount
sendLimit
```

Before using it:

```text
sendCount < sendLimit
```

After successful provider acceptance:

```text
sendCount += 1
```

When the limit is reached:

```text
skip org SMTP
→ use next usable route
```

Do not fail the delivery merely because the preferred route has exhausted its configured quota.

---

## 31. Site SMTP Counters

Environment variables cannot store mutable state.

Persist site SMTP usage/health counters in PostgreSQL.

Do not depend on Vercel instance memory for:

```text
sendCount
rate-window usage
health
```

---

## 32. Resend Rate Limiting

Configure Resend's application-level per-minute limit.

If local capacity for the current minute is exhausted before a provider call:

```text
leave/requeue item for later
```

Do not consume an automatic provider attempt merely because local rate capacity was exhausted.

---

## 33. Queue Claiming

For each queue separately:

```text
BEGIN
SELECT eligible queue rows
FOR UPDATE SKIP LOCKED
LIMIT 5
mark claimed
COMMIT
```

Perform email network calls after the claim transaction has committed.

---

## 34. Stale Queue Recovery

Use the same crash-recovery pattern as Sprint 04.

Recommended stale timeout:

```text
5 minutes
```

If a queue item remains claimed past the timeout, reset it safely.

Do not increment attempt count merely because a claim became stale before a real provider send started.

---

## 35. Attempt Counting

Count only real provider send calls.

Do not count:

- queue claims
- rate-limit waiting
- provider skipped because unhealthy
- attachment fetch failure when link-only sending proceeds
- stale claim recovery before provider call

Maximum four refers to actual provider send attempts.

---

## 36. Success Semantics

When Nodemailer/SMTP or Resend accepts the email:

```text
Delivery → SENT
```

Do not mark it `DELIVERED` without delivery-confirmation infrastructure.

No bounce/webhook handling is required now.

---

## 37. Duplicate Send Semantics

Do not introduce complex exactly-once provider guarantees in Sprint 06.

Use durable queue state and DeliveryAttempt history for best-effort duplicate prevention.

The delivery model is effectively:

```text
at-least-once with bounded retries
```

Retry automatically according to the 2 + 2 policy.

Do not add UNKNOWN state.

---

## 38. Manual DLQ Retry

Only `DEAD` deliveries may be manually retried.

Flow:

```text
Authorize user
    ↓
Load Delivery + active DLQ entry
    ↓
Mark DLQ entry resolved
    ↓
Delivery → PENDING
    ↓
Create fresh PrimaryDeliveryQueueItem
```

Reset queue-attempt counts for the new manual cycle.

Do not delete historical DeliveryAttempt or DLQ records.

---

## 39. Manual Retry Authorization

Both:

```text
GROUP_LEADER
GROUP_MEMBER
```

may manually retry a DEAD delivery because both roles may manage certificate sending.

Always validate organization ownership.

---

## 40. SMTP Configuration Authorization

Only:

```text
GROUP_LEADER
```

may create/update/disable organization SMTP credentials.

Group members may use configured SMTP indirectly but must not read or modify secrets.

---

## 41. SMTP Configuration API

Support organization-level actions for:

```text
create/update SMTP config
validate connection
disable config
read safe metadata
```

Never return password fields.

Safe response metadata may include:

```text
configured
active
host
port
username/fromEmail where acceptable
sendCount
sendLimit
rateLimitPerMinute
```

---

## 42. Suggested Error Codes

Extend shared error handling with codes such as:

```text
SMTP_CONFIGURATION_INVALID
SMTP_CONNECTION_FAILED
SMTP_LIMIT_REACHED
SMTP_RATE_LIMITED

EMAIL_INVALID_RECIPIENT
EMAIL_SEND_FAILED

EMAIL_PROVIDER_UNAVAILABLE
EMAIL_PROVIDER_RATE_LIMITED
EMAIL_PROVIDER_AUTH_ERROR
EMAIL_PROVIDER_REJECTED

DELIVERY_NOT_FOUND
DELIVERY_ALREADY_SENT
DELIVERY_NOT_RETRYABLE

DELIVERY_PRIMARY_RETRIES_EXHAUSTED
DELIVERY_BACKUP_RETRIES_EXHAUSTED
DELIVERY_MOVED_TO_RETRY_QUEUE
DELIVERY_MOVED_TO_DLQ
```

Do not expose raw provider internals or secrets.

---

## 43. Structured Logging

Log at minimum:

```text
workerId
deliveryId
certificateId
eventId
organizationId
queue
provider
attemptNumber
previousStatus
newStatus
duration
errorCode if present
```

Do not log SMTP passwords, API keys, or raw credential payloads.

Avoid logging participant email unless redacted or strictly required.

---

## 44. Dashboard Metadata Foundation

The resulting schema should later support:

```text
pending primary
pending retry
processing
sent
dead
provider used
total attempts
primary attempts
backup attempts
last error
DLQ reason
SMTP send count
SMTP send limit
provider health
provider rate-window usage
```

Do not build the full analytics dashboard in this sprint.

---

## 45. Idempotency

Database constraints must prevent:

- duplicate active primary queue rows for one Delivery
- duplicate active retry queue rows for one Delivery
- duplicate DLQ transition for one failure cycle

Real provider retries may create multiple DeliveryAttempt rows because they represent real attempts.

Queue transitions themselves must be idempotent.

---

## 46. Out of Scope

Do not implement:

- QR generation
- public certificate verification
- Resend delivery webhooks
- SMTP bounce processing
- open tracking
- click tracking
- SendGrid unless already trivial
- UNKNOWN state
- exactly-once email semantics
- Redis/BullMQ
- RabbitMQ
- SQS
- advanced provider reputation systems
- full dashboard analytics UI

---

## 47. Required Sprint-End Validation

At sprint completion run:

- Prisma schema validation
- required migrations
- TypeScript checks
- linting
- production build
- Vercel-compatible build

Validate:

- organization SMTP save
- SMTP connection test
- encrypted password persistence
- members cannot manage SMTP credentials
- primary queue creation
- retry queue creation
- DLQ creation
- worker claim maximum 5
- organization SMTP routing
- site SMTP routing
- Resend routing
- certificate link inclusion
- PNG attachment when possible
- link-only fallback on attachment retrieval failure
- first primary failure
- second primary failure
- atomic move to retry queue
- retry worker processing
- first backup failure
- second backup failure
- atomic move to DLQ
- Delivery → DEAD
- manual DEAD retry
- historical DLQ and attempts preserved
- 5 consecutive provider failures mark route unhealthy
- unhealthy provider skipped
- health restored/reset after later success
- per-minute provider limits
- SMTP send count and send limit
- concurrent worker claims
- stale-claim recovery
- no delivery exceeds four automatic provider attempts

---

## 48. Required Happy-Path Test

Scenario:

```text
Organization has valid SMTP
Delivery PENDING
```

Expected:

```text
Primary queue
    ↓
Primary worker
    ↓
Organization SMTP
    ↓
DeliveryAttempt created
    ↓
provider accepts
    ↓
Delivery SENT
```

Email contains the certificate link and, when safely available, PNG attachment.

---

## 49. Required Site SMTP Test

Scenario:

```text
Organization SMTP absent
Site SMTP configured
```

Expected:

```text
Primary worker
    ↓
Site SMTP
    ↓
SENT
```

Resend should not be used unnecessarily.

---

## 50. Required Resend Test

Scenario:

```text
No organization SMTP
No site SMTP
Resend configured
```

Expected:

```text
Resend becomes the usable primary route
```

Bounded retry rules still apply.

---

## 51. Required Primary-to-Retry Test

Simulate:

```text
Primary attempt 1 fails retryably
Primary attempt 2 fails retryably
```

Expected:

```text
Primary queue consumed
Delivery → RETRY_PENDING
Retry queue row created atomically
```

The primary worker must not directly execute the retry worker.

---

## 52. Required DLQ Test

Simulate:

```text
2 primary failures
+
2 backup failures
```

Expected:

```text
exactly 4 real provider attempts
Retry queue consumed
DeliveryDeadLetter created
Delivery → DEAD
```

No further automatic attempts occur.

---

## 53. Required Manual Retry Test

From:

```text
Delivery = DEAD
DLQ record exists
```

Authorized user retries.

Expected:

```text
old DLQ marked resolved
old DeliveryAttempt history retained
Delivery → PENDING
new PrimaryDeliveryQueueItem created
new automatic cycle begins
```

---

## 54. Required Provider Health Test

Simulate five consecutive provider-caused failures.

Expected:

```text
consecutiveFailures = 5
route marked temporarily unhealthy
new deliveries skip route
next usable route promoted
```

After cooldown and later successful send:

```text
consecutiveFailures = 0
route healthy again
```

---

## 55. Required Rate-Limit Test

Configure a low provider per-minute limit and enqueue more work than capacity.

Expected:

```text
capacity-available items send
excess items stay queued/requeued
no attempt consumed for local rate-capacity exhaustion
```

---

## 56. `current.md` Updates

Examples:

```text
- Added separate primary delivery queue.
- Added separate retry delivery queue.
- Added database-backed Delivery DLQ.
- Primary and retry workers are separate Vercel-triggered functions.
- Each delivery worker claims at most 5 items.
- Automatic policy is 2 primary attempts + 2 backup attempts.
- Organization SMTP preferred, then site SMTP, then Resend.
- SMTP configuration validates connection before activation.
- SMTP credentials encrypted at rest.
- Added provider-health tracking; 5 consecutive provider failures marks route unhealthy.
- Added per-minute provider limits and SMTP send-count/send-limit enforcement.
- Certificate link always included; PNG attached when safely available.
- DEAD deliveries support manual retry while preserving history.
- Sprint 06 Vercel production build passes.
```

Do not duplicate this specification into `current.md`.

---

## 57. Completion Condition

Sprint 06 is complete when the delivery pipeline behaves as:

```text
Issued Certificate
        ↓
Delivery PENDING
        ↓
Primary Queue
        ↓
Primary Vercel Worker
        ↓
Org SMTP / Site SMTP / Resend
        ↓
2 attempts maximum
        ↓ failure
Retry Queue
        ↓
Retry Vercel Worker
        ↓
backup provider
        ↓
2 attempts maximum
        ↓ failure
DLQ
        ↓
Delivery DEAD
        ↓
manual retry only
```

The pipeline must remain durable across Vercel invocations and must not depend on process memory.
