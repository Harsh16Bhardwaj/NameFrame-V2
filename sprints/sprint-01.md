# Sprint 01 — Foundation, Database, Authentication & Core State Model

## Objective

Build the architectural foundation for the NameFrame rewrite.

This sprint must establish:

- Next.js application foundation
- PostgreSQL database connectivity
- Prisma setup and initial migrations
- Clerk authentication
- local user synchronization
- organization membership and authorization
- core domain entities
- certificate generation job model
- delivery model
- retry and failure states
- shared error conventions
- soft deletion foundations
- production/Vercel-safe build

Do not implement later sprint UI or full certificate/email processing yet.

This sprint exists to make the data model, authentication model, state transitions, and failure handling stable enough that later sprints can build on them without destructive redesign.

---

# 1. Required Stack

Use:

- Next.js
- TypeScript
- PostgreSQL
- Prisma
- Clerk
- regular CSS

Do not introduce Tailwind.

Avoid new dependencies unless the existing stack or platform APIs cannot reasonably solve the problem.

Refer to `AGENTS.md` before implementation.

Use the previous `Namespace/` implementation only as a reference for authentication flow, UI patterns, and existing product behavior.

Do not reuse the old backend architecture blindly.

---

# 2. Authentication

Use Clerk for authentication.

The authentication behavior should remain functionally consistent with the previous NameFrame implementation, but the rewritten code must follow the new architecture.

## Local User Synchronization

A local `User` record must exist for authenticated Clerk users.

Preferred flow:

```text
Clerk user created/updated
        ↓
Clerk webhook
        ↓
Upsert local User
```

Also support a safe fallback during authenticated application requests:

```text
Authenticated Clerk user
        ↓
Local user missing
        ↓
Create/synchronize local User
```

This fallback must not replace the webhook as the primary synchronization mechanism.

## User Constraints

A user may belong to only one organization.

A user may exist without an organization immediately after signup.

Once they join or create an organization, they cannot belong to another organization unless future product requirements explicitly change this behavior.

---

# 3. Organization Model

## Organization Roles

Use the enum:

```text
GROUP_LEADER
GROUP_MEMBER
```

## Group Leader Permissions

A `GROUP_LEADER` can:

- create the organization
- manage organization members
- create events
- delete events
- view all organization events
- edit existing events
- manage participants
- manage certificate-related operations
- trigger certificate sends
- perform everything available to a group member

## Group Member Permissions

A `GROUP_MEMBER` can:

- view all events inside the organization
- edit existing events
- manage participants
- manage certificates
- trigger certificate sends

A group member cannot:

- create events
- delete events
- manage organization membership
- become group leader through normal application actions

## Leader Constraint

Each organization has exactly one `GROUP_LEADER`.

When a user creates an organization:

```text
Create Organization
        ↓
Create membership
        ↓
Assign GROUP_LEADER
```

The user becomes the sole leader automatically.

The schema and service layer must prevent an organization from having multiple leaders.

---

# 4. Core Organization Entities

At minimum define:

## User

Suggested fields:

```text
id
clerkUserId
email
name
organizationId?
createdAt
updatedAt
```

Requirements:

- `clerkUserId` unique
- `email` unique unless Clerk/user requirements make that unsafe
- user may initially have no organization
- user may belong to at most one organization

## Organization

Suggested fields:

```text
id
name
logoUrl?
createdByUserId
createdAt
updatedAt
```

## OrganizationMember

Use an explicit membership entity even though users may belong to only one organization.

Suggested fields:

```text
id
userId
organizationId
role
createdAt
updatedAt
```

Constraints:

- one membership per user
- one organization per user
- exactly one leader per organization
- organization-scoped authorization must go through membership

Do not authorize access merely because a client knows a resource ID.

---

# 5. Event Model

Create the initial `Event` entity.

Suggested fields:

```text
id
organizationId
createdByUserId

title
description
organizationName
organizationLogoUrl
location
eventDate

certificateTitle
emailSubject
emailBody

status

createdAt
updatedAt
deletedAt?
```

## Event Status

Use:

```text
DRAFT
ACTIVE
COMPLETED
```

Do not add `ARCHIVED`.

## Event Rules

- certificates cannot be sent while the event is `DRAFT`
- sending is allowed when the event is `ACTIVE`
- `COMPLETED` does not permanently block additional sends
- deletion is sufficient; no archive state is required

If later implementation needs a strict transition service, keep the model extensible enough to support it.

---

# 6. Soft Deletion

Event deletion must use soft deletion for operational data.

Use `deletedAt` where appropriate.

When an event is deleted, operational resources such as:

- participants
- template
- certificate jobs
- bulk operations
- deliveries
- delivery attempts

must no longer behave as active application data.

Do not physically remove issued verification information that is required to validate previously issued certificates.

Minimal verification-safe certificate records must survive event deletion.

All normal queries must exclude soft-deleted records unless explicitly performing administrative or cleanup work.

---

# 7. Participant Model

Create the initial `Participant` entity.

Fields:

```text
id
eventId
name
email
eligibleForCertificate
createdAt
updatedAt
deletedAt?
```

## Business Identity

Participant uniqueness is:

```text
(eventId, email)
```

Email is the user-facing/business identity for a participant inside an event.

An internal database ID should still exist for relations and foreign keys.

Do not expose the internal ID as the logical participant identity unless required internally.

## Eligibility

Use:

```text
eligibleForCertificate: boolean
```

No eligibility reason/source is required.

Later CSV/XLSX import may infer this field from attendance-like columns.

Examples of values that may later map to `true`:

```text
yes
true
1
present
checked/truthy value
```

Values such as empty/null/no/false/cross should map to false.

The exact parser belongs to the participant-import sprint, not this sprint.

---

# 8. Certificate Template Model

Each event supports exactly one certificate template in the current product scope.

Create a `CertificateTemplate` entity linked to an event.

Suggested fields:

```text
id
eventId

backgroundUrl

nameLeft
nameTop
nameRight
nameBottom

createdAt
updatedAt
deletedAt?
```

The four coordinates represent the bounding box in which the participant name should be rendered.

Do not add unnecessary template complexity in this sprint.

Do not implement:

- multiple templates per event
- participant-category templates
- arbitrary placeholder systems
- certificate versioning
- extra text fields

The template is mutable.

Issued certificates must later preserve enough immutable generation metadata so future template edits do not alter the meaning of already generated certificates.

Do not implement full generation logic in this sprint unless required to validate schema boundaries.

---

# 9. Bulk Operation Model

Bulk sending must have a parent operation.

Create an entity such as:

```text
BulkOperation
```

Suggested fields:

```text
id
eventId
requestedByUserId

status

totalCount
completedCount
failedCount

createdAt
startedAt?
completedAt?
updatedAt
deletedAt?
```

For a single-certificate send, no parent bulk operation is required.

Certificate jobs may therefore use:

```text
bulkOperationId?
```

A null value represents an individually-triggered send.

---

# 10. Bulk Operation State

Use a clear enum such as:

```text
PENDING
PROCESSING
COMPLETED
PARTIAL_FAILURE
FAILED
```

The exact aggregate state must be derived consistently from child jobs.

Do not mark a bulk operation `FAILED` merely because one participant failed.

Use `PARTIAL_FAILURE` when some child jobs succeed and some fail.

---

# 11. Certificate Generation Model

Certificates are generated only when a send operation is requested.

Do not:

- pre-generate certificates during participant import
- create unused certificate artifacts
- expose a "generate without sending" workflow

## Processing Flow

```text
Send One
   ↓
Create CertificateJob

Send Bulk
   ↓
Create BulkOperation
   ↓
Create N CertificateJobs
```

Every participant must receive an independently processable certificate job.

A failure for one participant must not fail the entire bulk operation.

---

# 12. Certificate Entity

Do not create a final `Certificate` record before successful generation.

The processing lifecycle belongs to `CertificateJob`.

After generation succeeds, create the issued certificate record.

Suggested fields:

```text
id
eventId
participantId

verificationId
artifactUrl

participantNameSnapshot
eventTitleSnapshot
organizationNameSnapshot

templateBackgroundUrlSnapshot
nameLeftSnapshot
nameTopSnapshot
nameRightSnapshot
nameBottomSnapshot

issuedAt
createdAt
```

The issued certificate data is immutable from normal application flows.

Do not add revoke/supersede states in the current scope.

## Verification ID

Do not derive the public certificate/verification ID from:

- participant name
- email
- event title
- predictable hashes of business data

Use a cryptographically secure random identifier.

Public verification will later use:

```text
/verify/{verificationId}
```

`verificationId` must be unique and non-enumerable.

---

# 13. Certificate Job Entity

Create `CertificateJob` as the durable unit of certificate generation work.

Suggested fields:

```text
id

eventId
participantId
bulkOperationId?

status

attemptCount
maxAttempts

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

## Certificate Job Status

Use:

```text
PENDING
PROCESSING
RETRY_PENDING
COMPLETED
DEAD
```

### Meaning

#### PENDING
Waiting for first processing attempt.

#### PROCESSING
Currently claimed by a worker.

#### RETRY_PENDING
A retryable failure occurred and the job should be processed again.

#### COMPLETED
Certificate generation succeeded and the corresponding certificate record exists.

#### DEAD
Retry policy is exhausted or the failure is permanently unrecoverable.

Do not add a generic `FAILED` state if the job is either retryable or dead.

Failure context belongs in:

```text
lastErrorCode
lastErrorMessage
attemptCount
```

---

# 14. Job Retry Metadata

Certificate jobs must preserve enough metadata for reliable processing.

Required:

```text
attemptCount
maxAttempts
claimedAt
claimedBy
startedAt
completedAt
lastErrorCode
lastErrorMessage
```

Do not add `nextAttemptAt` in Sprint 1.

Do not store `processingDurationMs`.

Duration can be calculated using timestamps.

The schema must support safe future worker claiming and crash recovery.

Do not rely on in-memory queue state.

---

# 15. Delivery Model

Certificate generation and email delivery must remain separate concepts.

Create a `Delivery` entity.

A delivery represents:

> Send an already-generated certificate to a participant.

Suggested fields:

```text
id

certificateId
eventId
participantId
bulkOperationId?

recipientEmail
status

attemptCount
maxAttempts

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

Do not create one giant "EmailEvent" entity that mixes certificate generation and delivery state.

---

# 16. Delivery Status

Use:

```text
PENDING
PROCESSING
RETRY_PENDING
SENT
DELIVERED
BOUNCED
DEAD
```

## State Meaning

### PENDING
Delivery is waiting for processing.

### PROCESSING
A worker has claimed the delivery.

### RETRY_PENDING
A retryable failure occurred.

### SENT
An email provider accepted the message.

This does not mean the recipient received it.

### DELIVERED
A provider webhook or trusted provider confirmation reported successful delivery.

### BOUNCED
The provider reported permanent delivery failure after accepting the message.

### DEAD
The application exhausted retries or encountered a permanent failure before successful provider acceptance.

Keep these semantics consistent everywhere.

Do not treat `SENT` and `DELIVERED` as equivalent.

---

# 17. Delivery Attempt Model

Each provider attempt must be stored independently.

Create `DeliveryAttempt`.

Suggested fields:

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

This allows the system to reconstruct delivery history such as:

```text
Attempt 1 → RESEND → timeout
Attempt 2 → RESEND → rate limited
Attempt 3 → SMTP → sent
```

Do not overwrite previous provider attempts.

---

# 18. Email Provider Enum

Define a provider enum that supports the intended architecture.

Initial values may include:

```text
RESEND
SMTP
SENDGRID
```

Do not require all providers to be fully implemented during Sprint 1.

Sprint 1 only needs the data model and provider abstraction boundaries to remain compatible with them.

---

# 19. Retry Strategy

The initial architecture uses PostgreSQL-backed durable work.

Do not create Redis, RabbitMQ, Kafka, SQS, or additional queue infrastructure in this sprint.

Do not create separate physical database queue tables for every retry level.

Represent retry progression using durable job/delivery state plus attempt counters.

Target behavior for later worker implementation:

```text
Initial processing
    ↓ failure

Retry 1
    ↓ failure

Retry 2
    ↓ failure

Fallback/delayed retry behavior
    ↓

Additional controlled attempts
    ↓

DEAD / DLQ-equivalent state
```

The intended policy is approximately:

```text
attempts <= 2
normal retry

later attempts
fallback provider / retry path

attemptCount > configured maximum
DEAD
```

Exact runtime routing belongs to the worker/delivery sprint.

Sprint 1 must make this possible without schema redesign.

---

# 20. SMTP Configuration

Organizations may configure their own SMTP credentials.

SMTP configuration belongs to the organization, not directly to each event.

Create an entity such as:

```text
OrganizationSmtpConfig
```

Suggested fields:

```text
id
organizationId

label
host
port
username
encryptedPassword
secure
active

createdAt
updatedAt
deletedAt?
```

Requirements:

- password must never be stored in plaintext
- credentials must never be returned unnecessarily to clients
- credentials must never be logged
- event-specific provider selection may be added later without moving credential ownership away from the organization

Do not implement elaborate provider analytics in this sprint.

---

# 21. Error Model

Establish a shared application error convention.

Use structured error codes plus human-readable messages.

Do not rely only on arbitrary strings.

Candidate application error codes include:

```text
VALIDATION_ERROR
AUTHENTICATION_ERROR
AUTHORIZATION_ERROR
NOT_FOUND
CONFLICT
RATE_LIMITED

GENERATION_ERROR
STORAGE_ERROR

EMAIL_INVALID_RECIPIENT
EMAIL_PROVIDER_RATE_LIMIT
EMAIL_PROVIDER_AUTH_ERROR
EMAIL_PROVIDER_UNAVAILABLE
EMAIL_PROVIDER_REJECTED

DATABASE_ERROR
INTERNAL_ERROR
```

Not every application error code must be a Prisma enum.

Use TypeScript-level error definitions where that is cleaner.

Persist structured error codes only where historical job/delivery diagnostics require them.

Every worker-facing error must eventually be classifiable as:

```text
RETRYABLE
NON_RETRYABLE
```

---

# 22. Retryable vs Non-Retryable Errors

Default classification for later worker logic:

## Retryable

Examples:

```text
network timeout
provider 429
provider 5xx
temporary storage failure
temporary Cloudinary failure
temporary database connectivity failure
```

## Non-Retryable

Examples:

```text
invalid participant email
missing participant
missing template
invalid certificate configuration
invalid request payload
permanent provider rejection
```

Provider authentication failures may be permanent for that provider but still allow fallback to another provider.

The data model must preserve enough detail to support that distinction.

---

# 23. Dashboard-Compatible Metadata

Sprint 1 should make the schema capable of supporting future dashboard queries for:

```text
total participants
eligible participants

certificate jobs pending
certificate jobs processing
certificates generated
certificate jobs dead

deliveries pending
deliveries processing
emails sent
emails delivered
emails bounced
deliveries dead

retry counts
fallback/provider attempt counts

bulk operation completion percentage

provider success/failure counts

generation duration
delivery processing duration

verification count later
```

Do not build the complete analytics dashboard in this sprint.

Do not add redundant persisted counters where they can reliably be derived from existing records.

Use indexes where future query patterns are obvious.

---

# 24. Auditability

Store actor information where it materially matters.

At minimum consider:

```text
Event.createdByUserId
BulkOperation.requestedByUserId
Organization.createdByUserId
OrganizationSmtpConfig creator if useful
```

Do not add `createdBy` fields to every low-level row simply for ceremony.

Delivery attempts and worker operations already carry operational history through their own metadata.

---

# 25. Database Client

Create a single reusable Prisma client setup suitable for Next.js development and production.

Requirements:

- avoid unnecessary Prisma client recreation during development hot reloads
- clean import path
- no database initialization scattered through route handlers
- environment validation for required DB configuration
- production-safe behavior for Vercel

Do not place raw Prisma initialization in arbitrary feature files.

---

# 26. Authorization Foundation

Create reusable authorization helpers/services.

The application must be able to answer:

```text
Who is this user?
Which organization do they belong to?
What is their role?
Does this resource belong to their organization?
Are they allowed to perform this action?
```

Do not authorize based only on resource IDs.

Every organization-owned operation must validate organization ownership.

Leader-only actions must explicitly enforce `GROUP_LEADER`.

---

# 27. API Error Conventions

Establish a consistent API response pattern.

At minimum support appropriate status handling for:

```text
400 validation failure
401 unauthenticated
403 unauthorized
404 resource not found
409 conflict
429 rate limited
500 unexpected internal error
```

Do not expose:

- stack traces
- Prisma internals
- SMTP credentials
- provider secrets
- raw exception objects
- sensitive participant information

Use structured application error codes where useful.

---

# 28. Initial Indexing and Constraints

Schema design must include constraints supporting correctness.

At minimum consider:

```text
User.clerkUserId UNIQUE
User.email UNIQUE

OrganizationMember.userId UNIQUE

Participant(eventId, email) UNIQUE

Certificate.verificationId UNIQUE
```

Also add indexes for expected operational queries, especially:

```text
Event.organizationId
Participant.eventId
CertificateJob.status
CertificateJob.eventId
CertificateJob.bulkOperationId

Delivery.status
Delivery.eventId
Delivery.bulkOperationId

DeliveryAttempt.deliveryId

BulkOperation.eventId
```

Do not add speculative indexes without an expected query.

---

# 29. Migration Requirements

This sprint must create and apply the initial Prisma migration for the rewrite.

Requirements:

- schema must be internally consistent
- migrations must be committed
- generated Prisma client must be reproducible
- local database connection must work
- production/Vercel database environment variables must be documented
- migration failures must not be silently ignored

If development and production use separate connection strings, document their intended use clearly.

---

# 30. Environment Variables

Document required environment variables using a safe example file.

At minimum expect categories for:

```text
DATABASE_URL
DIRECT_URL if required by hosting/database provider

Clerk publishable key
Clerk secret key
Clerk webhook secret

application credential encryption key
```

Do not commit real secrets.

Provider-specific email and Cloudinary secrets may be added in their implementation sprints unless already required.

---

# 31. Out of Scope

Do not fully implement these in Sprint 1:

- participant CSV/XLSX import
- certificate rendering
- Cloudinary generation pipeline
- QR generation
- email sending
- provider health routing
- worker polling loops
- retry execution
- DLQ UI
- certificate verification page
- dashboard analytics UI
- event/template product UI beyond what is necessary to verify the foundation
- bulk processing execution

Sprint 1 should make these future features possible without major schema redesign.

---

# 32. Required Sprint-End Validation

Do not run the full validation cycle after every individual feature.

At the end of Sprint 1, run the complete sprint-level validation.

Must include applicable:

- Prisma schema validation
- Prisma client generation
- migration validation
- TypeScript checks
- linting
- production build
- relevant authentication checks
- organization authorization checks
- critical database integration checks
- Vercel-compatible production build

The sprint is not complete while relevant failures remain.

If an unrelated pre-existing failure blocks validation, document it clearly in `current.md`.

---

# 33. Required Sprint-End Review

Before marking Sprint 1 complete, verify:

- Clerk authentication works
- local users synchronize correctly
- user can create only one organization
- organization creator becomes sole `GROUP_LEADER`
- members cannot perform leader-only actions
- schema migration applies successfully
- database client is centralized
- event lifecycle enum is present
- participant uniqueness is enforced
- template belongs to one event
- certificate jobs have durable processing states
- delivery has independent delivery states
- delivery attempts preserve provider history
- retry metadata exists
- structured error fields exist where required
- SMTP credentials have an encrypted-storage design
- soft deletion fields exist where required
- issued certificate verification data can survive event deletion
- production build succeeds

---

# 34. `current.md` Updates

During implementation, update `sprints/current.md` only for meaningful progress.

Examples:

```text
- Prisma/PostgreSQL configured.
- Initial migration created and applied.
- Clerk webhook user synchronization implemented.
- Organization leader/member authorization implemented.
- Core certificate and delivery job schema added.
- Chose PostgreSQL-backed durable jobs; no external queue introduced.
- Sprint 1 production build passes.
```

Do not duplicate this entire document into `current.md`.

This file remains the permanent Sprint 1 specification.

---

# 35. Completion Condition

Sprint 1 is complete only when the rewrite has a stable foundation for:

```text
Authentication
Organizations
Membership + roles

Prisma/PostgreSQL
Initial migrations

Events
Participants
Templates

Bulk operations

Certificate jobs
Issued certificates

Deliveries
Delivery attempts

Organization SMTP configuration

Verification-safe identifiers

Enums and lifecycle states

Structured error conventions

Centralized database access
Reusable authorization helpers

Vercel production build
```

Do not begin Sprint 2 until this foundation is stable enough that later feature work does not require avoidable schema rewrites.
