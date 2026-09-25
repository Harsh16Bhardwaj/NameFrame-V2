# Sprint 05 — Certificate Generation & Issuance

## Objective

Replace the Sprint 04 stub certificate processor with the real certificate-generation pipeline.

This sprint should deliver:

- Cloudinary transformation-based certificate generation
- PNG certificate artifacts
- participant name rendering using the existing NameFrame implementation as reference
- automatic font-size reduction for long names
- secure random verification UUID generation
- immutable issued certificate records
- certificate snapshot metadata
- certificate integrity hash
- reuse of an existing issued certificate when appropriate
- delivery-job creation after successful issuance
- clear generation error classification
- generation observability
- sprint-end Vercel production validation

Do not implement QR generation, email provider execution, delivery workers, verification UI, or provider fallback in this sprint.

Refer to `AGENTS.md` before implementation.

---

# 1. Core Processing Flow

Sprint 04 already provides:

```text
CertificateJob
    ↓
Worker claims job
    ↓
Processor invoked
```

Sprint 05 replaces the stub processor with:

```text
CertificateJob
    ↓
Validate event
    ↓
Validate participant
    ↓
Validate template
    ↓
Check existing issued certificate
    ↓
Reuse existing certificate OR generate new certificate
    ↓
Generate secure verification UUID
    ↓
Generate PNG through Cloudinary transformation
    ↓
Persist immutable Certificate
    ↓
Create Delivery
    ↓
Mark CertificateJob COMPLETED
```

Each certificate job remains independently retryable.

---

# 2. Rendering Provider

Use Cloudinary transformations as the primary and only certificate-rendering mechanism in Sprint 05.

Do not implement:

- Canvas rendering
- Sharp-based certificate generation
- PDF generation
- browser-side certificate rendering
- alternate rendering providers

Keep Cloudinary interaction behind a small adapter/service boundary so it can be replaced later without rewriting certificate-job orchestration.

Example conceptual boundary:

```text
CertificateRenderer
    ↓
CloudinaryCertificateRenderer
```

Do not create unnecessary factories or abstraction layers.

---

# 3. Output Format

Generated certificates must be:

```text
PNG
```

Do not generate PDF/JPEG variants in this sprint.

Persist the resulting Cloudinary asset URL in the Certificate record.

---

# 4. Name Rendering

The only dynamic text rendered in Sprint 05 is:

```text
participant name
```

Before implementing name rendering:

1. inspect the previous `Namespace/` implementation
2. understand exactly how participant-name placement was handled
3. reuse/adapt the proven transformation logic where appropriate
4. preserve the new architecture around it

Do not blindly rewrite a working rendering mechanism if the previous implementation already handles Cloudinary placement correctly.

Do not reuse old queue/business architecture.

---

# 5. Template Inputs

Use the template configuration created in Sprint 02.

At minimum:

```text
backgroundUrl

nameLeft
nameTop
nameRight
nameBottom

fontSize
fontColor
fontWeight
textAlign
```

Coordinates are normalized values.

Before Cloudinary rendering:

```text
normalized coordinates
        ↓
convert using original certificate dimensions
        ↓
construct Cloudinary transformation
```

Do not assume browser-preview dimensions equal the original certificate dimensions.

---

# 6. Long Name Handling

If the configured font size does not fit the participant name inside the name bounding box:

```text
reduce font size
```

Continue reducing until either:

- the name fits
- the configured minimum font size is reached

Define a sensible minimum font size.

Keep the algorithm simple and deterministic.

Do not:

- clip text silently
- render outside the configured box
- stretch/compress the font unnaturally

If the name still cannot fit at the minimum font size:

```text
generation fails with a non-retryable rendering/configuration error
```

Use a structured error code.

Example:

```text
CERTIFICATE_NAME_DOES_NOT_FIT
```

---

# 7. Event Validation

Certificate generation is allowed for:

```text
ACTIVE
COMPLETED
```

Certificate generation is not allowed for:

```text
DRAFT
```

A deleted event must never generate certificates.

Suggested errors:

```text
EVENT_NOT_ACTIVE
EVENT_DELETED
```

These are non-retryable business failures.

---

# 8. Participant Validation

Before generation, re-check the participant.

Required:

```text
participant exists
participant belongs to event
participant not deleted
eligibleForCertificate = true
```

Do not assume eligibility is still valid merely because the job was created earlier.

If eligibility is removed after queueing but before processing:

```text
CertificateJob → DEAD
```

with a non-retryable structured error.

Suggested code:

```text
PARTICIPANT_NOT_ELIGIBLE
```

---

# 9. Template Validation

Before generation:

```text
template exists
template belongs to event
template not deleted
background URL exists
coordinates valid
style config valid
```

If the template is missing or invalid:

```text
CertificateJob → DEAD
```

Suggested error codes:

```text
EVENT_TEMPLATE_MISSING
INVALID_TEMPLATE_COORDINATES
INVALID_TEMPLATE_CONFIGURATION
```

Do not retry invalid business configuration automatically.

---

# 10. Verification Identifier

Generate a secure random UUID for every newly issued certificate.

Use a cryptographically secure server-side mechanism.

The verification identifier must:

- be unique
- be unpredictable
- not contain participant information
- not be derived from name/email/event data

Suggested field:

```text
verificationId
```

Future verification URL:

```text
/verify/{verificationId}
```

Do not implement QR generation in Sprint 05.

Do not hardcode a deployment hostname into certificate data.

Future verification URLs should derive their base URL from deployment/application configuration.

---

# 11. No QR Generation

QR generation is explicitly out of scope for this sprint.

Do not:

- generate QR images
- embed QR into certificate
- add QR coordinates
- add QR storage fields merely for future speculation

Focus only on:

```text
verificationId
```

The verification ID must be sufficient for the later verification sprint.

---

# 12. Existing Certificate Reuse

Before generating a new certificate, check whether the participant already has an issued certificate for the event.

If an existing valid issued certificate exists:

```text
reuse it
```

Do not regenerate another certificate unnecessarily.

Conceptual flow:

```text
CertificateJob
    ↓
Find existing Certificate(eventId, participantId)
    ↓
Exists?
  ┌───────┴────────┐
 Yes              No
  ↓                ↓
reuse          generate
certificate    certificate
```

This behavior reduces:

- duplicate artifacts
- unnecessary Cloudinary operations
- inconsistent verification IDs
- duplicate issuance

---

# 13. Reuse Rule

Use one current issued certificate per:

```text
eventId + participantId
```

for the current product scope.

Because NameFrame currently supports one template per event and no certificate versioning, repeated sends should reuse the existing certificate.

If participant or template data changes after issuance:

```text
existing issued certificate remains immutable
```

Do not mutate the issued certificate.

For Sprint 05, do not automatically create versions or regenerate on mutation.

A future explicit reissue workflow may handle that requirement.

This keeps certificate issuance stable and predictable.

---

# 14. Certificate Uniqueness

Enforce a database-safe uniqueness rule such as:

```text
UNIQUE(eventId, participantId)
```

for current issued certificates.

The implementation must prevent two concurrent workers from issuing two certificates for the same participant/event.

Do not rely only on a pre-query check.

Use a database constraint/upsert-safe pattern where appropriate.

---

# 15. Certificate Snapshot

When creating a new Certificate, persist immutable snapshot data.

At minimum:

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

fontSizeSnapshot
fontColorSnapshot
fontWeightSnapshot
textAlignSnapshot

certificateHash

issuedAt
createdAt
```

Do not store participant email in the Certificate unless implementation proves it necessary.

Delivery owns recipient email.

---

# 16. Snapshot Immutability

After issuance, normal application flows must not modify snapshot fields.

Future edits to:

- participant name
- event title
- organization information
- template placement
- template styling

must not mutate already issued certificate records.

The issued artifact and stored snapshot represent what was actually issued at that time.

---

# 17. Certificate Integrity Hash

Create a simple SHA-256 integrity hash.

Do not implement HMAC/signature infrastructure in this sprint.

Build the hash from a deterministic stable payload.

Example logical fields:

```text
verificationId
participantNameSnapshot
eventTitleSnapshot
organizationNameSnapshot
artifactUrl
issuedAt
```

Use an explicit canonical ordering/serialization.

Do not hash arbitrary JSON object serialization whose key order may change unexpectedly.

Example conceptual payload:

```text
verificationId|participantName|eventTitle|organizationName|artifactUrl|issuedAt
```

Then:

```text
SHA-256(payload)
```

Persist result as:

```text
certificateHash
```

This is integrity metadata, not a replacement for authentication or authorization.

---

# 18. Cloudinary Asset Identity

Certificate-generation retries must not create uncontrolled duplicate assets.

Use a deterministic Cloudinary public identifier based on stable internal identity.

Recommended:

```text
certificates/{eventId}/{participantId}
```

or another safe equivalent.

Do not use participant names/emails directly in public asset identifiers.

A retry should target/reuse the same logical Cloudinary asset.

---

# 19. Cloudinary Transformation

The renderer should:

1. load/use the persisted certificate background
2. determine original asset dimensions
3. convert normalized text bounds into actual coordinates
4. calculate appropriate name font size
5. create transformation instructions
6. request/build final PNG asset
7. return artifact metadata

Return a small typed result such as:

```text
artifactUrl
publicId
width
height
```

Do not leak raw provider response objects throughout the application.

---

# 20. Cloudinary Error Classification

Classify Cloudinary failures.

## Retryable

Examples:

```text
network timeout
429
Cloudinary 5xx
temporary provider outage
temporary connectivity error
```

These should trigger:

```text
RETRY_PENDING
```

subject to Sprint 04 retry limits.

## Non-Retryable

Examples:

```text
missing source asset
invalid transformation
invalid template coordinates
unsupported configuration
malformed request
```

These should trigger:

```text
DEAD
```

Do not retry deterministic configuration errors six times merely to prove they remain broken.

---

# 21. External Work and Transactions

Do not hold a database transaction open during Cloudinary generation.

Correct flow:

```text
Validate job/domain data
        ↓
Check existing certificate
        ↓
Cloudinary external generation
        ↓
External work succeeds
        ↓
Short database transaction
```

External network operations must occur outside long-lived database transactions.

---

# 22. Issuance Transaction

After successful artifact generation, create/update internal state using a short transaction.

The transaction should atomically handle:

```text
Certificate creation
Delivery creation
CertificateJob → COMPLETED
```

If the Certificate already exists because another concurrent execution won the race:

```text
reuse existing Certificate
```

and ensure delivery/job state remains correct.

Do not create duplicate deliveries accidentally during race recovery.

---

# 23. Delivery Creation

Once an issued certificate exists, create a Delivery record.

Initial state:

```text
PENDING
```

The Delivery represents:

> This issued certificate must be sent to this participant.

Actual sending occurs in Sprint 06.

---

# 24. Delivery Snapshot

At Delivery creation, snapshot:

```text
recipientEmail
emailSubject
emailBody
```

using the values effective when the send operation was created.

This prevents later event edits from changing already-queued email content.

Do not read live event email content during the later delivery worker execution.

---

# 25. Existing Certificate + New Delivery

When a CertificateJob finds an existing issued certificate:

```text
reuse certificate
        ↓
create Delivery if this send operation does not already have one
        ↓
mark job COMPLETED
```

Do not require Cloudinary generation again.

Use idempotency constraints so worker retries do not create multiple identical Delivery rows for the same logical send operation.

---

# 26. Delivery Uniqueness

Define a safe logical uniqueness strategy for Delivery creation.

It should allow:

- legitimate future resends
- prevention of duplicate delivery caused by one job retry

A useful approach is to link Delivery to the CertificateJob or logical send operation.

For example:

```text
sourceCertificateJobId UNIQUE
```

or equivalent.

Document the selected constraint in `current.md`.

Do not globally enforce one lifetime delivery per certificate.

Resending must remain possible later.

---

# 27. Worker Processor Result

The certificate processor should return structured outcomes to the Sprint 04 worker.

Examples:

```text
COMPLETED_NEW_CERTIFICATE
COMPLETED_REUSED_CERTIFICATE
```

or a simpler typed success result containing:

```text
certificateId
deliveryId
reused
```

Failure must still use the shared retryable/non-retryable error mechanism.

Do not encode state transitions in arbitrary strings.

---

# 28. Job Completion

A CertificateJob may be marked:

```text
COMPLETED
```

only after:

```text
Certificate exists
AND
Delivery exists
```

for that logical send operation.

Do not mark job complete immediately after Cloudinary responds if DB issuance state was not successfully persisted.

---

# 29. Failure After Cloudinary Success

A critical crash case:

```text
Cloudinary artifact generated
        ↓
process crashes before DB transaction
```

On retry:

```text
same deterministic Cloudinary public ID
        ↓
reuse/overwrite same logical artifact
        ↓
persist Certificate safely
```

This is why deterministic asset identity and DB uniqueness are required.

---

# 30. Failure After Certificate Creation

Another crash case:

```text
Certificate created
        ↓
process crashes before job completion
```

On retry:

```text
find existing Certificate
        ↓
reuse it
        ↓
ensure Delivery exists
        ↓
complete job
```

Do not generate another certificate.

---

# 31. Event/Template Mutation During Queueing

Always load current operational event/participant/template data when generation begins.

However, once a Certificate is successfully issued:

```text
its snapshot is final
```

Future mutations affect only future first-time certificate generations.

Because existing participant certificates are reused in the current scope, a previously issued certificate remains unchanged even if template styling changes later.

This is intentional.

---

# 32. Observability

Log structured metadata for generation.

At minimum:

```text
workerId
jobId
eventId
participantId
attemptNumber
certificateId if created/reused
reusedCertificate
cloudinaryPublicId
generationStartedAt
generationCompletedAt
duration
result
errorCode if present
```

Do not log:

- participant email
- Cloudinary secrets
- Clerk secrets
- database credentials
- full provider error dumps containing sensitive values

---

# 33. Generation Metrics Foundation

The schema/logging should make it possible later to derive:

```text
certificates generated
certificates reused
generation success rate
generation failure rate
average generation duration
retry rate
Cloudinary failure rate
```

Do not build analytics dashboards in Sprint 05.

---

# 34. API Surface

Actual certificate generation remains asynchronous.

Public/application routes should enqueue work rather than perform Cloudinary generation inline.

Possible service/API foundations:

```text
POST /api/events/:eventId/send/:participantId
POST /api/events/:eventId/send-bulk
```

If Sprint 04 already introduced equivalent job-creation endpoints, reuse them.

Do not create a second generation route architecture.

The route should:

```text
validate
        ↓
create/reuse job operation
        ↓
return accepted/job information
```

Actual generation remains worker-driven.

---

# 35. HTTP Behavior

Asynchronous send/generation requests should return appropriate accepted responses.

Prefer:

```text
202 Accepted
```

when work is queued rather than completed.

Return useful identifiers such as:

```text
jobId
bulkOperationId if applicable
```

Do not return a fake certificate URL before generation finishes.

---

# 36. Error Codes

Extend structured errors as needed.

Suggested generation-specific codes:

```text
PARTICIPANT_NOT_ELIGIBLE
EVENT_NOT_ACTIVE
EVENT_TEMPLATE_MISSING
INVALID_TEMPLATE_CONFIGURATION
INVALID_TEMPLATE_COORDINATES

CERTIFICATE_NAME_DOES_NOT_FIT
CERTIFICATE_GENERATION_FAILED

CLOUDINARY_RATE_LIMITED
CLOUDINARY_UNAVAILABLE
CLOUDINARY_INVALID_TRANSFORMATION
CLOUDINARY_SOURCE_MISSING

CERTIFICATE_PERSISTENCE_FAILED
DELIVERY_CREATION_FAILED
```

Classify each as retryable or non-retryable.

Do not expose raw Cloudinary messages directly to users.

---

# 37. Security

Cloudinary credentials must remain server-side.

Do not expose:

```text
API secret
signing secret
server-only transformation credentials
```

The client must not be able to arbitrarily generate trusted certificate transformations by supplying unrestricted transformation parameters.

Treat persisted template configuration as server-validated input.

---

# 38. Deployment Base URL

Do not hardcode the current Vercel deployment URL inside certificate records or generation logic.

Use environment/application configuration such as:

```text
APP_BASE_URL
```

The later verification/QR sprint can build:

```text
{APP_BASE_URL}/verify/{verificationId}
```

Sprint 05 only needs to persist the UUID.

If the deployment hostname changes, certificate generation should not require source-code changes.

---

# 39. No QR Scope

Explicitly do not implement:

```text
QR generation
QR embedding
QR Cloudinary overlay
QR coordinate editing
QR storage
```

The only verification work in this sprint is:

```text
secure verification UUID
```

---

# 40. Reuse Requirements

Before implementing rendering logic, inspect `Namespace/`.

Specifically identify:

- Cloudinary certificate transformation code
- participant-name overlay mechanics
- text positioning logic
- font behavior
- any existing long-name handling

Reuse good implementation details where they remain valid.

Do not copy:

- old database architecture
- old queue architecture
- old retry logic
- old route coupling
- insecure provider configuration

---

# 41. Out of Scope

Do not implement in Sprint 05:

- QR generation
- public verification page
- email provider execution
- Resend
- SMTP sending
- SendGrid
- provider fallback
- provider health tracking
- delivery retries
- email webhooks
- bounce handling
- delivery dashboard
- certificate revoke/supersede
- certificate versioning
- PDF generation

---

# 42. Sprint-End Validation

At sprint completion run:

- Prisma schema validation if changed
- migrations if changed
- TypeScript checks
- linting
- production build
- Vercel-compatible build
- worker integration
- Cloudinary rendering
- normalized coordinate conversion
- long-name font shrinking
- existing-certificate reuse
- concurrent issuance protection
- deterministic Cloudinary public IDs
- retryable Cloudinary failure handling
- permanent Cloudinary failure handling
- immutable certificate snapshot
- secure UUID generation
- certificate hash generation
- delivery creation
- email subject/body snapshot
- job completion only after certificate + delivery persistence

---

# 43. Required New Certificate Test

Test:

```text
eligible participant
active event
valid template
no existing certificate
```

Expected:

```text
CertificateJob PENDING
        ↓
Worker processes
        ↓
Cloudinary PNG generated
        ↓
verification UUID created
        ↓
Certificate persisted
        ↓
Delivery PENDING created
        ↓
CertificateJob COMPLETED
```

---

# 44. Required Existing Certificate Test

Process a second logical send for the same participant/event.

Expected:

```text
existing Certificate found
        ↓
Cloudinary generation skipped
        ↓
existing Certificate reused
        ↓
new logical Delivery created safely
        ↓
CertificateJob COMPLETED
```

Certificate count must remain unchanged.

---

# 45. Required Retry Test

Simulate retryable Cloudinary failure.

Expected:

```text
PROCESSING
→ RETRY_PENDING
```

with:

```text
attemptCount updated
nextAttemptAt set
lastErrorCode populated
```

Retry later should succeed without duplicate certificate issuance.

---

# 46. Required Permanent Failure Test

Test invalid template configuration.

Expected:

```text
PROCESSING
→ DEAD
```

No unnecessary retries.

No Certificate created.

No Delivery created.

---

# 47. Required Crash-Recovery Test

Simulate:

```text
Cloudinary asset exists
DB Certificate not created
worker crashes
```

Retry the same job.

Expected:

```text
same logical Cloudinary asset reused
Certificate created once
Delivery created once
job completed
```

---

# 48. Required Concurrency Test

Trigger concurrent processing paths for the same logical participant/event issuance.

Expected:

```text
one Certificate only
```

Database uniqueness must protect against duplicate issuance.

No duplicate unintended deliveries for the same job.

---

# 49. `current.md` Updates

Examples:

```text
- Replaced Sprint 04 stub processor with Cloudinary renderer.
- PNG certificate generation implemented.
- Reused Namespace participant-name transformation approach.
- Added automatic font-size reduction for long names.
- Added secure random verification UUID.
- QR generation intentionally deferred.
- Issued Certificate snapshots are immutable.
- Existing event/participant certificate is reused on resend.
- Added SHA-256 certificate integrity hash.
- Cloudinary asset ID is deterministic for retry safety.
- Successful issuance creates PENDING Delivery.
- Delivery snapshots email subject/body.
- Sprint 05 Vercel production build passes.
```

Do not duplicate this specification into `current.md`.

---

# 50. Completion Condition

Sprint 05 is complete when the real pipeline works end-to-end through issuance:

```text
CertificateJob
    ↓
Vercel worker
    ↓
Validate event / participant / template
    ↓
Existing certificate?
    ├── Yes → reuse
    └── No
          ↓
      Cloudinary PNG generation
          ↓
      secure verification UUID
          ↓
      SHA-256 integrity hash
          ↓
      immutable Certificate
          ↓
Create PENDING Delivery
          ↓
CertificateJob COMPLETED
```

After Sprint 05, Sprint 06 can focus entirely on processing `Delivery` records through email providers without touching certificate-generation architecture.
