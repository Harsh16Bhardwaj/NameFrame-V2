# Sprint 09 — Basic Security & Health Checks

## Objective

Keep Sprint 09 intentionally small.

This sprint is only a final basic hardening pass before scale/testing work.

Implement:

- authentication checks for every private API
- authorization and organization ownership checks for every protected resource
- role checks where leader-only behavior exists
- very basic in-memory rate limiting for event creation and email-send initiation
- a protected health endpoint
- basic database/service health checks
- safe production error responses
- sprint-end Vercel build validation

Do not turn this sprint into a full security/observability platform.

Refer to `AGENTS.md` before implementation.

---

# 1. Authentication Audit

Review every private API endpoint.

Each protected endpoint must verify:

```text
authenticated user exists
```

Public routes should remain public only where intentionally designed.

Examples of intentionally public functionality:

```text
certificate verification
Clerk webhook endpoint
```

Everything else should require authentication unless explicitly documented otherwise.

---

# 2. Authorization Audit

Authentication alone is not sufficient.

Every protected resource operation must also verify that the current user is allowed to access it.

Check organization ownership for resources such as:

```text
event
participant
certificate template
certificate job
certificate
bulk operation
delivery
delivery attempt
retry queue item
DLQ entry
SMTP configuration
```

A user must never be able to access another organization's data merely by guessing an ID.

---

# 3. Role Checks

Continue using the existing organization roles:

```text
GROUP_LEADER
GROUP_MEMBER
```

Apply the role rules already established in previous sprints.

Examples:

## GROUP_LEADER

May:

```text
manage organization members
manage organization SMTP configuration
create/delete events
mark events completed
perform member actions
```

## GROUP_MEMBER

May:

```text
view organization events
edit allowed event content
manage participants
manage certificates
trigger sends
retry permitted failed work
```

Do not introduce new roles in Sprint 09.

---

# 4. Ownership Before Mutation

For any endpoint using IDs such as:

```text
eventId
participantId
templateId
jobId
bulkOperationId
certificateId
deliveryId
```

validate:

```text
resource belongs to authenticated user's organization
```

before reading sensitive data or performing mutations.

Do not trust client-supplied organization IDs.

Derive organization context from the authenticated user.

---

# 5. Basic Event-Creation Rate Limit

Add a very basic rate limit for event creation.

This does not need durable distributed infrastructure.

Use simple in-memory limiting per Vercel instance.

The purpose is only to prevent obvious accidental/request-spam behavior.

Keep the limits configurable through constants/environment where appropriate.

Do not introduce:

```text
Redis
external rate-limit service
database rate-limit tables
```

for this.

Because Vercel instances do not share memory, this is intentionally best-effort protection only.

---

# 6. Basic Send Rate Limit

Apply the same lightweight in-memory protection to operations that initiate email/certificate sending.

Examples:

```text
send one
send bulk
manual rapid repeated send initiation
```

This is separate from the durable provider rate limiting already implemented in Sprint 06.

Sprint 06 provider limits remain authoritative for actual email throughput.

Sprint 09's in-memory limit only prevents obvious API spam before work enters the queue.

---

# 7. Do Not Rate Limit Everything

Do not add generic rate limiting across every API.

Do not spend time rate limiting:

```text
normal dashboard reads
participant list reads
event reads
ordinary authenticated GET endpoints
```

unless an obvious abuse issue exists.

Keep this sprint deliberately basic.

---

# 8. Health Endpoint

Add a protected health endpoint.

Suggested route:

```text
GET /api/health
```

or:

```text
GET /api/internal/health
```

The endpoint should use a server-side health secret/token so it is not an unrestricted diagnostics endpoint.

Example environment variable:

```text
HEALTH_CHECK_SECRET
```

Do not reuse user authentication for machine/service health checks unless existing infrastructure makes that cleaner.

---

# 9. Health Checks

The health endpoint should perform only lightweight checks.

At minimum:

```text
application running
database reachable
```

Also check configured external services where practical using our own server-side credentials/configuration.

Possible checks:

```text
Cloudinary configuration available
Resend configuration available
site SMTP configuration/connection if enabled
```

Keep provider checks lightweight.

Do not send actual emails or generate certificates as part of routine health checks.

---

# 10. Health Response

Return a small safe response.

Example:

```json
{
  "status": "healthy",
  "services": {
    "database": "healthy",
    "cloudinary": "configured",
    "smtp": "configured",
    "resend": "configured"
  }
}
```

If something important fails:

```json
{
  "status": "degraded",
  "services": {
    "database": "unhealthy"
  }
}
```

Do not return:

```text
credentials
API keys
database URLs
SMTP passwords
raw provider responses
stack traces
```

---

# 11. Health Endpoint Authorization

Require the configured health-check credential.

For example:

```text
Authorization: Bearer <HEALTH_CHECK_SECRET>
```

or another simple internal-header convention.

Requests without a valid secret should be rejected.

Do not expose deep system diagnostics publicly.

---

# 12. Safe Production Errors

Review API responses and ensure production errors do not expose:

```text
stack traces
Prisma internals
database connection strings
SMTP credentials
Cloudinary secrets
Resend keys
Clerk secrets
CRON_SECRET
HEALTH_CHECK_SECRET
```

Return existing structured application errors instead.

Do not build a new error framework if the current one already works.

---

# 13. Existing Worker Security

Confirm internal worker endpoints from previous sprints still require:

```text
CRON_SECRET
```

This includes:

```text
certificate worker
primary delivery worker
retry delivery worker
```

Do not weaken these routes while reorganizing APIs.

---

# 14. Public Verification

Keep public certificate verification public.

Do not require Clerk login for:

```text
/verify
/verify/{verificationId}
```

Continue using only the secure random verification UUID.

No additional verification-security infrastructure is required in Sprint 09.

---

# 15. No Additional Security Infrastructure

Explicitly do not add:

```text
Sentry
Datadog
Prometheus
Redis rate limiting
persistent AuditLog
AES key-rotation framework
SIEM integrations
complex CSP work
WAF configuration
distributed tracing
custom metrics platform
```

unless one is already present and requires effectively no additional architecture.

The goal is basic correctness, not enterprise theatre.

---

# 16. Sprint-End Validation

At sprint completion run:

- TypeScript checks
- linting
- production build
- Vercel-compatible build

Manually verify:

- unauthenticated user cannot access private APIs
- authenticated user cannot access another organization's event
- authenticated user cannot access another organization's participant
- authenticated user cannot access another organization's jobs/deliveries
- member cannot perform leader-only SMTP/organization operations
- leader permissions still work
- event-creation rate limit triggers
- send-initiation rate limit triggers
- normal queue/provider limits continue working
- health endpoint rejects invalid credentials
- health endpoint works with valid credentials
- database health is reported correctly
- configured service status is reported safely
- worker endpoints still require CRON_SECRET
- no secrets appear in API responses

---

# 17. `current.md` Updates

Examples:

```text
- Audited authentication across private APIs.
- Audited organization ownership checks across protected resources.
- Verified GROUP_LEADER / GROUP_MEMBER authorization rules.
- Added lightweight in-memory event-creation rate limiting.
- Added lightweight in-memory send-initiation rate limiting.
- Added protected health endpoint using HEALTH_CHECK_SECRET.
- Health endpoint checks database and configured service availability.
- Confirmed worker endpoints remain CRON_SECRET protected.
- Sprint 09 Vercel production build passes.
```

Do not duplicate this entire specification into `current.md`.

---

# 18. Completion Condition

Sprint 09 is complete when:

```text
Private API request
    ↓
authenticated?
    ↓
authorized?
    ↓
resource belongs to organization?
    ↓
allowed
```

and the application exposes one safe protected health endpoint for basic service checks.

No additional security platform is required for this sprint.
