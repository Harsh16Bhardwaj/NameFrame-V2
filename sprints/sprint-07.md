# Sprint 07 — Public Certificate Verification

## Objective

Implement the public certificate verification flow.

This sprint should deliver:

- public verification by secure certificate UUID
- `/verify` lookup page
- `/verify/{verificationId}` direct verification route
- verification against immutable issued-certificate snapshots
- SHA-256 integrity validation
- verification that continues to work after event deletion
- inline certificate display
- certificate open/download link
- clean invalid/tampered-certificate handling
- simple public-route protection
- sprint-end Vercel production validation

Do not implement QR generation, certificate revocation, certificate superseding, public name search, verification analytics, Redis caching, or complex anti-abuse infrastructure in this sprint.

Refer to `AGENTS.md` before implementation.

---

# 1. Core Principle

Certificate verification must depend only on immutable issued-certificate data.

Verification must not depend on:

```text
live Event row
live Participant row
live Template row
live Organization profile
```

because those records may later be edited or soft-deleted.

The authoritative source for verification is:

```text
Certificate
```

and its stored snapshot fields.

---

# 2. Verification Identifier

Use the secure random UUID generated in Sprint 05:

```text
verificationId
```

Public verification URL:

```text
/verify/{verificationId}
```

Do not derive lookup behavior from:

- participant name
- email
- event title
- internal participant ID
- internal certificate ID

Verification must use the public UUID only.

---

# 3. Public Routes

Implement:

```text
/verify
```

and:

```text
/verify/{verificationId}
```

## `/verify`

Provide a simple form where a user may paste/type a verification UUID.

Flow:

```text
Enter verification ID
        ↓
Submit
        ↓
Redirect/navigate to /verify/{verificationId}
```

Do not expose public search by participant name or event.

## `/verify/{verificationId}`

Load and verify the certificate directly.

This route is public and requires no Clerk login.

---

# 4. Verification API / Server Logic

Use a small server-side verification service.

Conceptual flow:

```text
verificationId
    ↓
validate UUID format
    ↓
load Certificate
    ↓
not found?
    ├── yes → NOT_FOUND
    └── no
          ↓
      recompute integrity hash
          ↓
      compare with stored certificateHash
          ↓
      match?
        ├── yes → VERIFIED
        └── no  → INTEGRITY_FAILED
```

Do not place all verification logic directly inside the page component.

---

# 5. Verification Result States

Use only:

```text
VERIFIED
NOT_FOUND
INTEGRITY_FAILED
```

Do not add:

```text
REVOKED
SUPERSEDED
UNKNOWN
```

in Sprint 07.

These states are not currently part of the product scope.

---

# 6. Public Information

For a verified certificate, display only:

```text
participantNameSnapshot
eventTitleSnapshot
organizationNameSnapshot
issuedAt
certificate artifact
verificationId
```

Do not expose:

```text
participant email
internal participant ID
internal event ID
internal organization ID
database IDs
job IDs
delivery IDs
provider information
error metadata
```

---

# 7. Certificate Display

For a valid certificate:

- show the certificate PNG inline
- provide a clear action to open/download the certificate
- display verification status prominently
- show participant/event/organization/issue date

Use the existing `artifactUrl`.

Do not regenerate the certificate during verification.

---

# 8. Verification Page Layout

Keep the page simple.

Suggested layout:

```text
NameFrame Verification

[ VERIFIED ]

Participant: Harsh Bhardwaj
Event: AI Cohort
Organization: Example Organization
Issued: 24 Sep 2026

┌──────────────────────────────┐
│                              │
│     Certificate Preview      │
│                              │
└──────────────────────────────┘

[ Open Certificate ]
```

For invalid certificates:

```text
Certificate not found
```

For integrity failure:

```text
Certificate verification failed
```

Do not show technical hash details publicly.

---

# 9. Deleted Event Behavior

Verification must continue to work when the operational event has been soft-deleted.

Example:

```text
Event deleted
Participant removed
Template removed
```

but:

```text
Certificate remains
```

Expected:

```text
/verify/{verificationId}
→ still VERIFIED
```

because verification reads immutable certificate snapshots.

Do not join to the live Event/Participant/Template merely to render basic verification details.

---

# 10. Integrity Hash Validation

Sprint 05 stores:

```text
certificateHash
```

using SHA-256 over a canonical payload.

Sprint 07 must recompute the same payload.

Use exactly the same field order and serialization used during issuance.

Example logical payload:

```text
verificationId
participantNameSnapshot
eventTitleSnapshot
organizationNameSnapshot
artifactUrl
issuedAt
```

The implementation should use one shared helper for:

```text
generateCertificateHash()
```

Do not duplicate hash construction in issuance and verification code.

---

# 11. Integrity Failure

If recomputed hash differs from:

```text
certificateHash
```

return:

```text
INTEGRITY_FAILED
```

Do not present the certificate as verified.

Do not expose:

- expected hash
- computed hash
- internal diagnostics

to the public page.

Log enough server-side context for debugging.

---

# 12. Invalid Verification ID

If the path value is malformed:

```text
return invalid/not found behavior
```

Do not query unnecessary database records.

A malformed or unknown UUID should result in a clean public response.

Use:

```text
404
```

for unknown certificate IDs where appropriate.

---

# 13. Error Handling

Add structured errors where useful:

```text
INVALID_VERIFICATION_ID
CERTIFICATE_NOT_FOUND
CERTIFICATE_INTEGRITY_FAILED
VERIFICATION_INTERNAL_ERROR
```

Public responses must remain simple.

Do not expose:

```text
Prisma errors
stack traces
hash values
database internals
```

---

# 14. Public API Shape

If an API route is used, a successful response may contain:

```json
{
  "status": "VERIFIED",
  "certificate": {
    "verificationId": "...",
    "participantName": "...",
    "eventTitle": "...",
    "organizationName": "...",
    "issuedAt": "...",
    "artifactUrl": "..."
  }
}
```

For invalid lookup:

```json
{
  "status": "NOT_FOUND"
}
```

For integrity failure:

```json
{
  "status": "INTEGRITY_FAILED"
}
```

Do not return the raw Certificate database object.

---

# 15. No Authentication Required

Verification is public.

Do not require:

```text
Clerk login
organization membership
event ownership
```

to verify a certificate.

Internal certificate-management routes remain authenticated.

---

# 16. Basic Public Abuse Protection

Add simple protection to avoid excessive verification requests.

Use the lightest existing mechanism available in the application.

Do not introduce Redis solely for verification rate limiting.

If no suitable reusable mechanism exists, keep validation strict and document stronger rate limiting for the later security sprint.

Do not allow this requirement to create a large new infrastructure dependency.

---

# 17. Caching

Certificates are immutable after issuance.

Verification reads are therefore naturally cache-friendly.

Use standard Next.js/HTTP caching where appropriate.

Do not introduce Redis.

Be careful not to cache:

```text
NOT_FOUND
```

for excessively long periods if deployment/data propagation may matter.

Keep the implementation simple.

---

# 18. No Verification Analytics

Do not create:

```text
verificationCount
VerificationEvent
verification history table
```

in Sprint 07.

Verification analytics are not currently important enough to justify additional writes on every public read.

The dashboard can omit verification-count metrics for now.

---

# 19. No QR Generation

QR generation remains out of scope.

Do not:

- generate QR images
- modify existing certificate PNGs
- add QR coordinates
- regenerate certificates

The route structure is already ready for future QR support:

```text
{APP_BASE_URL}/verify/{verificationId}
```

A later sprint may encode this URL into QR without changing verification architecture.

---

# 20. Certificate Artifact Availability

If the Certificate row is valid but the artifact URL is unavailable:

- verification metadata may still be valid
- show a clear artifact-unavailable message
- do not incorrectly report integrity failure solely because the external image cannot currently load

Differentiate:

```text
certificate identity/integrity
```

from:

```text
temporary artifact availability
```

---

# 21. Snapshot Trust Boundary

The verification page must display snapshot fields from the issued Certificate.

Do not replace them with live values.

Example:

If organization changes its name after issuance:

```text
Certificate snapshot:
Old Organization Name
```

Verification should continue displaying:

```text
Old Organization Name
```

because that is what was issued.

---

# 22. UI Reuse

Inspect `Namespace/` before creating verification UI.

Reuse useful:

- certificate display component
- public page styling
- CSS classes
- branding components
- certificate image handling

Do not copy old verification backend logic if it violates the new immutable-certificate model.

---

# 23. Suggested Service Boundary

Keep verification logic compact.

Example:

```text
CertificateVerificationService
    ↓
verify(verificationId)
```

Return a small typed result:

```text
VERIFIED
NOT_FOUND
INTEGRITY_FAILED
```

Do not create unnecessary repository/factory layers if existing application structure does not require them.

---

# 24. Database Query

Verification should perform a direct indexed lookup using:

```text
verificationId
```

The field must already be unique/indexed from Sprint 05/Sprint 01.

Avoid unnecessary joins.

The common verification request should require roughly:

```text
1 certificate lookup
```

plus no other database queries unless required.

---

# 25. Security

Public verification must never trust client-supplied certificate metadata.

Client supplies only:

```text
verificationId
```

Server decides:

- whether certificate exists
- whether hash matches
- what public fields may be returned

Do not allow client parameters to override:

```text
participant name
event title
organization name
artifact URL
issued date
```

---

# 26. Out of Scope

Do not implement in Sprint 07:

- QR generation
- QR embedding
- revocation
- superseding certificates
- public participant search
- email lookup
- event lookup
- verification analytics
- open/download analytics
- Redis caching
- complex rate-limit infrastructure
- certificate regeneration
- artifact migration

---

# 27. Sprint-End Validation

At sprint completion run:

- TypeScript checks
- linting
- production build
- Vercel-compatible build
- valid verification UUID
- malformed UUID
- unknown UUID
- integrity success
- integrity failure
- certificate display
- certificate open/download
- deleted-event certificate verification
- public access without Clerk
- no sensitive data exposure
- direct indexed certificate lookup

---

# 28. Required Valid Verification Test

Given an issued Certificate:

```text
valid verificationId
valid stored hash
```

Expected:

```text
/verify/{verificationId}
    ↓
VERIFIED
```

Display:

```text
participant name
event title
organization name
issued date
certificate PNG
```

---

# 29. Required Deleted-Event Test

Create/issue certificate.

Then soft-delete:

```text
Event
Participant
Template
```

Expected:

```text
/verify/{verificationId}
→ VERIFIED
```

Verification must rely on Certificate snapshots only.

---

# 30. Required Integrity Failure Test

Modify a snapshot field directly in test data without updating:

```text
certificateHash
```

Expected:

```text
INTEGRITY_FAILED
```

Do not display the certificate as verified.

---

# 31. Required Not-Found Test

Use:

```text
unknown verification UUID
```

Expected:

```text
NOT_FOUND
```

with clean public UI.

No internal error details.

---

# 32. Required Privacy Test

Inspect verification response/page.

Ensure it does not expose:

```text
email
participantId
eventId
organizationId
jobId
deliveryId
provider data
internal timestamps beyond issuedAt
```

---

# 33. `current.md` Updates

Examples:

```text
- Added public /verify lookup page.
- Added direct /verify/{verificationId} route.
- Verification reads immutable Certificate snapshots only.
- Added shared SHA-256 integrity verification helper.
- Deleted events remain publicly verifiable.
- Valid certificates display inline PNG and certificate link.
- Invalid UUIDs return clean NOT_FOUND behavior.
- Integrity failures do not expose internal hash data.
- QR generation intentionally deferred.
- Verification analytics intentionally omitted.
- Sprint 07 Vercel production build passes.
```

Do not duplicate this entire specification into `current.md`.

---

# 34. Completion Condition

Sprint 07 is complete when a third party can:

```text
Open /verify
    ↓
enter verification UUID
    ↓
load issued Certificate
    ↓
validate SHA-256 integrity
    ↓
see VERIFIED / NOT_FOUND / INTEGRITY_FAILED
    ↓
view certificate metadata
    ↓
open/download certificate PNG
```

and verification remains valid even when the operational event no longer exists.
