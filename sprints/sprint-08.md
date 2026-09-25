# Sprint 08 — Dashboard, Operational Visibility & Manual Recovery

## Objective

Implement the operational dashboard for NameFrame.

This sprint should make the system understandable and operable by organization users without requiring direct database access or log inspection.

This sprint should deliver:

- organization dashboard
- event-level dashboard
- participant/certificate/delivery summary metrics
- bulk operation progress
- certificate job visibility
- delivery visibility
- retry-queue visibility
- DLQ visibility
- manual retry controls
- provider health visibility
- SMTP usage visibility
- recent operational activity
- clear loading/empty/error states
- reuse of existing dashboard UI from `Namespace/`
- sprint-end Vercel production validation

Do not build a separate analytics warehouse, BI pipeline, time-series database, or complex reporting system.

Use the existing PostgreSQL operational data as the source of truth.

Refer to `AGENTS.md` before implementation.

---

# 1. Core Goal

An authorized organization user should be able to answer:

```text
How many events do we have?
How many participants are there?
How many are eligible?
How many certificates have been issued?
How many sends are pending?
How many emails were sent?
What is retrying?
What is dead?
Which provider is being used?
What failed?
Can I retry it?
```

without inspecting:

```text
database rows
Vercel logs
Cloudinary console
Resend dashboard
SMTP provider dashboard
```

The dashboard should expose useful operational truth, not vanity analytics.

---

# 2. Dashboard Scope

Implement two levels:

```text
Organization Dashboard
Event Dashboard
```

Do not introduce a third analytics hierarchy unless necessary.

---

# 3. Organization Dashboard

Suggested route:

```text
/dashboard
```

Show aggregate information for the authenticated user's organization.

At minimum:

```text
total events
active events
completed events
draft events

total participants
eligible participants

issued certificates

pending deliveries
sent deliveries
dead deliveries

retry queue count
DLQ count
```

Do not include data from another organization.

---

# 4. Event Dashboard

Each event should have an operational overview.

Suggested route:

```text
/events/{eventId}
```

or an existing event dashboard section.

Show at minimum:

```text
event status

total participants
eligible participants
ineligible participants

certificates issued
certificate jobs pending
certificate jobs processing
certificate jobs retrying
certificate jobs dead

deliveries pending
deliveries processing
deliveries retrying
deliveries sent
deliveries dead

bulk operations
```

Keep metrics understandable.

Do not expose every internal DB enum directly if a cleaner label exists.

---

# 5. Dashboard Data Source

Use PostgreSQL operational records directly.

Do not create duplicate persistent counters unless already required.

Prefer derived queries from:

```text
Event
Participant
Certificate
CertificateJob
BulkOperation
Delivery
PrimaryDeliveryQueueItem
RetryDeliveryQueueItem
DeliveryDeadLetter
DeliveryAttempt
```

Where aggregates can be calculated reliably from source data, derive them.

Avoid counter drift.

---

# 6. No Analytics Warehouse

Do not introduce:

```text
ClickHouse
BigQuery
Elasticsearch
Redis analytics
separate reporting database
event-stream analytics
```

The current workload does not justify it.

Use PostgreSQL aggregation and proper indexes.

---

# 7. Summary Cards

Reuse the dashboard card style from `Namespace/` where possible.

Keep the first view concise.

Recommended organization cards:

```text
Events
Participants
Certificates Issued
Emails Sent
Retrying
Dead / Needs Attention
```

Recommended event cards:

```text
Participants
Eligible
Certificates Issued
Pending Work
Sent
Needs Attention
```

Do not create twenty cards showing every possible enum.

Detailed state belongs in tables.

---

# 8. Bulk Operation Visibility

Show recent bulk operations for an event.

For each operation display:

```text
created/requested time
requested by
total jobs
completed jobs
dead jobs
pending jobs
processing jobs
status
```

Progress should be derived from child jobs where practical.

Example:

```text
923 / 1000 completed
17 processing
43 pending
17 dead
```

Do not display fake 100% progress merely because the parent row says COMPLETED incorrectly.

Child job state is the operational source of truth.

---

# 9. Bulk Operation Status

Present clean labels for:

```text
PENDING
PROCESSING
COMPLETED
PARTIAL_FAILURE
FAILED
```

Example user-facing wording:

```text
Pending
Processing
Completed
Completed with failures
Failed
```

Do not hide partial failure.

The user must be able to distinguish:

```text
999 succeeded, 1 failed
```

from:

```text
entire batch failed
```

---

# 10. Certificate Job Table

Provide an operational table for certificate-generation jobs.

Show useful fields:

```text
participant name
participant email if appropriate for authenticated org user
status
attempt count
bulk operation if present
created time
last attempt time
last error
```

Possible filters:

```text
all
pending
processing
retrying
completed
dead
```

Use server-side pagination.

Do not load thousands of jobs into the browser.

---

# 11. Certificate Job Detail

When inspecting a failed/dead certificate job, show:

```text
participant
event
status
attemptCount
maxAttempts
lastErrorCode
lastErrorMessage
createdAt
startedAt
completedAt
```

Do not expose:

```text
stack traces
Cloudinary secrets
database internals
raw provider responses
```

If the job is `DEAD`, allow manual retry if authorized and if the underlying business conditions are currently valid.

---

# 12. Certificate Job Manual Retry

Both:

```text
GROUP_LEADER
GROUP_MEMBER
```

may retry dead certificate jobs.

Before retry:

```text
revalidate event
revalidate participant
revalidate eligibility
revalidate template
```

If the cause is still invalid:

```text
do not restart blindly
```

Return a clear structured error.

Example:

```text
EVENT_TEMPLATE_MISSING
PARTICIPANT_NOT_ELIGIBLE
```

If valid:

```text
DEAD
→ PENDING
```

using the Sprint 04 manual-retry service.

Do not duplicate retry logic inside the dashboard route.

---

# 13. Delivery Table

Provide delivery visibility.

Show:

```text
participant
recipient email
certificate
status
total attempts
current queue
provider used most recently
last error
created time
sent time if available
```

Possible filters:

```text
all
pending
processing
retrying
sent
dead
```

Sprint 08 does not use `DELIVERED`/`BOUNCED` as active product states because Sprint 06 intentionally deferred webhook handling.

---

# 14. Current Queue Display

A delivery should visibly indicate where it currently sits:

```text
Primary Queue
Retry Queue
Dead Letter Queue
Completed/Sent
```

Do not make users infer this by combining multiple raw status fields manually.

Create one server-side derived operational label.

---

# 15. Delivery Attempt History

For a selected delivery, show its attempt history.

Example:

```text
Attempt 1
Provider: Organization SMTP
Result: Failed
Error: SMTP connection timeout

Attempt 2
Provider: Organization SMTP
Result: Failed
Error: Provider unavailable

Attempt 3
Provider: Resend
Result: Sent
```

Use `DeliveryAttempt` records.

Do not overwrite or collapse previous attempts.

---

# 16. Retry Queue Visibility

Provide a view/filter for deliveries currently in:

```text
RetryDeliveryQueueItem
```

Show at minimum:

```text
participant
delivery status
backup provider
retry attempt count
next attempt time
last error
```

This is operational visibility.

Do not allow arbitrary editing of queue internals from the UI.

---

# 17. DLQ Visibility

Provide a clear:

```text
Needs Attention
```

or:

```text
Dead Letter Queue
```

view.

Each entry should show:

```text
participant
event
failed provider
total attempts
last error code
last error message
movedAt
resolved status
```

The user should be able to understand why the delivery stopped.

---

# 18. Manual Delivery Retry

Both organization roles may retry a `DEAD` delivery.

Use the Sprint 06 manual-retry service.

Expected:

```text
Delivery DEAD
    ↓
manual retry
    ↓
old DLQ row marked resolved
    ↓
Delivery → PENDING
    ↓
new PrimaryDeliveryQueueItem
```

Preserve:

```text
old DeliveryAttempt rows
old DeliveryDeadLetter history
```

Do not delete history when retrying.

---

# 19. Retry Confirmation

Manual retry should require a simple confirmation.

Example:

```text
Retry delivery to participant@example.com?
```

No typed confirmation is required.

Typed confirmation remains appropriate for destructive actions such as deleting an event.

---

# 20. Provider Health Panel

Expose provider health at organization level.

Show routes relevant to the organization:

```text
Organization SMTP
Site SMTP
Resend
```

For each provider route, show only safe operational metadata such as:

```text
Available
Unavailable
Temporarily unhealthy
Rate limited

consecutiveFailures
unhealthyUntil
lastSuccessAt
lastFailureAt
```

Do not expose provider credentials.

---

# 21. Provider Health Labels

Use simple labels:

```text
Healthy
Temporarily unavailable
Rate limited
Not configured
```

Do not expose internal routing complexity unless needed.

For example:

```text
Organization SMTP — Healthy
Site SMTP — Healthy
Resend — Healthy
```

is enough.

---

# 22. SMTP Usage

For organization SMTP show:

```text
sendCount
sendLimit
rateLimitPerMinute
active
```

Example:

```text
184 / 400 sends used
20 emails/minute
```

Do not expose:

```text
password
encryptedPassword
server secrets
```

Only `GROUP_LEADER` may open/manage SMTP configuration.

Members may see safe provider health/usage if useful for operational debugging.

---

# 23. Provider Rate-Limit Visibility

If a provider route is currently at its local configured per-minute limit:

```text
show Rate Limited
```

Do not represent this as provider failure.

Pending deliveries remain queued.

---

# 24. Recent Activity

Provide a small recent-activity section.

Use existing operational timestamps rather than creating a new audit/event table solely for dashboard decoration.

Examples:

```text
Bulk send started
Bulk send completed
Certificate job failed
Delivery moved to retry queue
Delivery moved to DLQ
Delivery sent
```

Keep this compact.

Do not reconstruct an enormous activity feed.

---

# 25. Error Presentation

Map structured backend errors to readable dashboard text.

Examples:

```text
EVENT_TEMPLATE_MISSING
→ Certificate template is missing.

PARTICIPANT_NOT_ELIGIBLE
→ Participant is no longer eligible for a certificate.

SMTP_CONNECTION_FAILED
→ SMTP provider could not be reached.

EMAIL_PROVIDER_RATE_LIMITED
→ Email provider is temporarily rate limited.
```

Do not dump raw error codes without explanation.

It is acceptable to display the internal error code in a smaller troubleshooting/detail view.

---

# 26. Search

Operational tables should support lightweight search.

Certificate/delivery tables should support searching by:

```text
participant name
participant email
```

Use server-side search.

Do not load all operational rows into browser memory.

---

# 27. Pagination

Use server-side pagination for:

```text
certificate jobs
deliveries
bulk operations if numerous
DLQ records
```

Recommended default:

```text
25–50 rows/page
```

Use consistent pagination behavior across the dashboard.

---

# 28. Filters

Use practical filters only.

Certificate jobs:

```text
status
```

Deliveries:

```text
status
queue
provider if useful
```

Events:

```text
status
```

Do not build a generic query-builder UI.

---

# 29. Organization Isolation

Every dashboard query must be organization-scoped.

Do not:

```text
load record by job ID
→ return it
```

without confirming the underlying event/organization belongs to the authenticated user.

This applies to:

```text
BulkOperation
CertificateJob
Certificate
Delivery
DeliveryAttempt
Retry queue rows
DLQ rows
Provider health
SMTP usage
```

---

# 30. Role Behavior

Both:

```text
GROUP_LEADER
GROUP_MEMBER
```

may:

- view operational dashboards
- inspect certificate jobs
- inspect deliveries
- inspect attempts
- retry dead certificate jobs
- retry dead deliveries

Only:

```text
GROUP_LEADER
```

may:

- manage SMTP credentials
- create/delete events
- perform leader-only actions already defined

Do not invent additional dashboard-only role rules.

---

# 31. API Structure

Use server-side dashboard/query services rather than placing aggregation logic directly inside React components.

Suggested conceptual endpoints:

```text
GET /api/dashboard
GET /api/events/:eventId/dashboard

GET /api/events/:eventId/bulk-operations
GET /api/events/:eventId/certificate-jobs
GET /api/events/:eventId/deliveries

GET /api/deliveries/:deliveryId
GET /api/certificate-jobs/:jobId

POST /api/certificate-jobs/:jobId/retry
POST /api/deliveries/:deliveryId/retry

GET /api/organization/providers/status
```

Exact route layout may follow existing project conventions.

---

# 32. Dashboard Query Service

Create clear reusable query functions/services for aggregate data.

Conceptual examples:

```text
getOrganizationDashboard()
getEventDashboard(eventId)
getBulkOperations(eventId, filters)
getCertificateJobs(eventId, filters)
getDeliveries(eventId, filters)
getProviderStatus(organizationId)
```

Avoid large route handlers containing raw aggregation logic.

---

# 33. Performance

The dashboard should not issue dozens of sequential database queries when a few grouped queries can provide the same result.

Use:

```text
Promise.all
groupBy
count
aggregations
```

where appropriate.

Do not prematurely build materialized views.

At the target scale, indexed PostgreSQL aggregation is sufficient.

---

# 34. Index Review

Review indexes for dashboard query patterns.

Likely useful fields include:

```text
Event.organizationId
Event.status

Participant.eventId
Participant.eligibleForCertificate

Certificate.eventId

CertificateJob.eventId
CertificateJob.status
CertificateJob.bulkOperationId

Delivery.eventId
Delivery.status

DeliveryAttempt.deliveryId
DeliveryAttempt.provider

RetryDeliveryQueueItem.deliveryId
DeliveryDeadLetter.deliveryId
DeliveryDeadLetter.resolvedAt

BulkOperation.eventId
BulkOperation.status
```

Add indexes only when supported by real dashboard queries.

---

# 35. No Redundant Analytics Counters

Do not add fields such as:

```text
Event.sentCount
Event.failedCount
Organization.totalCertificates
```

just because the dashboard displays those numbers.

Prefer source-of-truth aggregation.

Add counters only later if query performance proves necessary.

---

# 36. Loading States

Every dashboard section should have an explicit loading state.

Examples:

```text
Loading events...
Loading delivery activity...
Loading failed jobs...
```

Do not blank the entire dashboard while one secondary panel loads if the architecture supports independent fetching.

Keep implementation reasonable.

---

# 37. Empty States

Use useful empty states.

Examples:

```text
No events yet.
No certificate jobs yet.
No failed deliveries.
Retry queue is empty.
No dead-letter deliveries.
```

An empty DLQ is good news.

Do not display an empty table with unexplained headers.

---

# 38. Error States

If one dashboard query fails:

- show a clear local error if possible
- do not leak internal details
- allow retry/reload
- avoid crashing the whole dashboard unnecessarily

Use existing shared error handling.

---

# 39. UI Reuse

Inspect `Namespace/` before implementing dashboard UI.

Reuse/adapt:

```text
dashboard cards
event cards
tables
status badges
layout
navigation
empty states
CSS
```

Do not rebuild an equivalent dashboard from scratch.

Do not reuse old backend aggregation logic if it conflicts with the rewritten schema.

---

# 40. Status Styling

Create/reuse a consistent status badge system.

Examples:

```text
Pending
Processing
Retrying
Sent
Completed
Completed with failures
Dead
Healthy
Rate limited
```

Do not create a new CSS class for every screen if a shared status style already exists.

Follow `AGENTS.md` DRY/CSS rules.

---

# 41. No Fancy Charts Required

Charts are optional.

Do not add charting libraries.

If an existing chart library already exists and a small chart clearly improves the UI, it may be reused.

The sprint is complete without charts.

Operational tables and counts are more important.

---

# 42. No New Analytics Events

Do not create:

```text
DashboardViewEvent
MetricSnapshot
AnalyticsEvent
```

in Sprint 08.

Use existing system data.

---

# 43. Out of Scope

Do not implement in Sprint 08:

- QR generation
- email bounce webhooks
- open tracking
- click tracking
- verification analytics
- external analytics warehouse
- Redis caching
- alerting/paging
- historical time-series charts
- scheduled reports
- exported analytics CSV
- provider billing analytics
- job cleanup/retention automation

These belong to later hardening/observability work if needed.

---

# 44. Sprint-End Validation

At sprint completion run:

- TypeScript checks
- linting
- production build
- Vercel-compatible build

Test:

- organization dashboard metrics
- event dashboard metrics
- organization isolation
- leader/member dashboard access
- bulk operation progress
- certificate job filtering
- delivery filtering
- search
- pagination
- retry queue visibility
- DLQ visibility
- certificate job manual retry
- delivery manual retry
- DLQ history preservation
- delivery attempt history
- provider health panel
- SMTP usage display
- loading states
- empty states
- error states
- no sensitive provider data exposed

---

# 45. Required Dashboard Test

Create test data containing:

```text
multiple events
eligible/ineligible participants
completed/pending/dead certificate jobs
sent/pending/dead deliveries
retry queue rows
DLQ rows
```

Expected:

```text
organization dashboard totals are correct
event dashboard totals are correct
```

No counts should include another organization's records.

---

# 46. Required Bulk Operation Test

Create a bulk operation containing mixed child states.

Example:

```text
100 total
75 completed
10 processing
10 pending
5 dead
```

Expected:

```text
progress displays correct child-state totals
operation shown as processing/partial as appropriate
```

Do not rely solely on stale parent counters.

---

# 47. Required Certificate Retry Test

From dashboard:

```text
CertificateJob = DEAD
```

Underlying participant/event/template are valid.

Authorized user retries.

Expected:

```text
DEAD → PENDING
```

Worker infrastructure can process it again.

Historical failure information remains available through logs/metadata as designed.

---

# 48. Required Delivery Retry Test

From dashboard:

```text
Delivery = DEAD
DLQ record exists
```

Authorized user retries.

Expected:

```text
DLQ record resolved
Delivery → PENDING
new PrimaryDeliveryQueueItem created
old DeliveryAttempt history preserved
```

---

# 49. Required Invalid Retry Test

Attempt to retry a dead certificate job where:

```text
participant is no longer eligible
```

Expected:

```text
retry rejected
```

with a readable error.

Do not blindly requeue invalid work.

---

# 50. Required Provider Status Test

Simulate:

```text
Organization SMTP healthy
Site SMTP unhealthy
Resend rate limited
```

Dashboard should reflect each state accurately without exposing credentials.

---

# 51. Required Privacy Test

Inspect every dashboard response.

Ensure it does not expose:

```text
SMTP passwords
encryptedPassword
Resend API keys
Clerk secrets
CRON_SECRET
database URLs
Cloudinary secrets
raw stack traces
```

Authenticated organization members may see participant email because they already manage participants.

---

# 52. `current.md` Updates

Examples:

```text
- Added organization dashboard.
- Added event operational dashboard.
- Added participant/certificate/delivery summary metrics.
- Added bulk-operation progress derived from child jobs.
- Added certificate-job inspection and filters.
- Added delivery/attempt inspection.
- Added retry-queue and DLQ views.
- Added manual certificate-job retry.
- Added manual DEAD delivery retry.
- Added provider-health and SMTP-usage visibility.
- Reused Namespace dashboard cards/tables/CSS.
- Sprint 08 Vercel production build passes.
```

Do not duplicate this entire specification into `current.md`.

---

# 53. Completion Condition

Sprint 08 is complete when an organization user can open NameFrame and understand the operational state of their certificate system:

```text
Organization Dashboard
        ↓
Events / participants / certificates / deliveries
        ↓
Open Event
        ↓
Bulk-operation progress
        ↓
Certificate jobs
        ↓
Deliveries + attempts
        ↓
Retry Queue
        ↓
DLQ
        ↓
Inspect failure
        ↓
Manual retry where valid
```

The dashboard must provide enough visibility that routine operational issues can be diagnosed and recovered without direct database access.
