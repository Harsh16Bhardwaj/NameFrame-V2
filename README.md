# NameFrame: One-Stop Post-Event Certification Solution

NameFrame turns a participant roster into personalized, verifiable certificates and delivers them through an observable, recoverable pipeline.

It gives organizers one workspace for:

- event and organization management
- CSV/XLSX participant imports
- certificate template upload and name placement
- asynchronous certificate generation
- Nodemailer-based SMTP delivery with provider fallback
- retries, dead-letter recovery, and operational visibility
- unique certificate verification links
- organization-wide participant and delivery reporting

The system is designed around a simple principle: every important transition is durable, inspectable, and safe to retry.

## Pipeline at a glance

```text
Roster
  │
  ├─ validate aliases, duplicates, eligibility
  ├─ persist participants in bounded database batches
  │
  ▼
Certificate jobs
  │
  ├─ claim up to 5 jobs with PostgreSQL row locking
  ├─ render certificate artwork through Cloudinary
  ├─ persist immutable certificate and verification snapshots
  │
  ▼
Primary delivery queue
  │
  ├─ resolve organization SMTP first
  ├─ send through Nodemailer
  ├─ record provider response and attempt history
  │
  ├─ retryable failure ──► retry delivery queue
  │                         │
  │                         └─ exhausted ──► dead-letter record
  │
  ▼
Sent certificate email
  │
  └─ verification code and public certificate link
```

The certificate-generation job and the two delivery queues are separate operational work lanes. A shared database-coordinated worker pool drains them without relying on process memory as the source of truth.

## Core capabilities

### Participant intake

- Import up to 10,000 participant rows per import.
- Accept CSV and XLSX files with browser-side parsing and preview.
- Match common column aliases for names, emails, and eligibility fields.
- Report invalid rows, warnings, duplicates, and eligibility before persistence.
- Persist records in 500-row database batches.
- Normalize email addresses before event-scoped uniqueness checks.
- Restore a soft-deleted participant instead of creating a conflicting historical duplicate.

Raw spreadsheet files are not uploaded to the server or stored as participant data.

### Certificate design and rendering

- Upload certificate artwork and position the participant name visually.
- Store normalized name coordinates so placement remains stable across image dimensions.
- Fit long names deterministically, reducing font size down to a safe minimum.
- Render through Cloudinary using deterministic public IDs.
- Preserve the event, participant, organization, template, and style snapshots used at issuance time.
- Persist a stable certificate artifact URL for later access and delivery retries.

### Durable generation

- Single and bulk sends create durable certificate jobs before processing starts.
- Requests use idempotency keys to avoid duplicate work from repeated submissions.
- PostgreSQL claims jobs with `FOR UPDATE SKIP LOCKED`.
- Each claim is limited to five certificate jobs.
- Jobs record processing state, attempt count, worker identity, timestamps, and failure category.
- Retryable failures return to `RETRY_PENDING` with deterministic backoff.
- Permanent or exhausted failures remain inspectable as `DEAD`.
- Stale claims can be recovered after five minutes.

### Email delivery

Nodemailer is the primary transport behind a provider-neutral delivery contract.

Provider routing is:

1. organization SMTP through Nodemailer
2. site SMTP through Nodemailer
3. Resend fallback when configured

The delivery subsystem provides:

- separate primary and retry PostgreSQL queues
- provider acceptance status distinct from inbox delivery
- attempt history and provider error codes
- per-provider cooldown and health state
- configurable send and rate limits
- bounded primary and backup attempts
- manual retry for dead-letter deliveries
- individual and bulk certificate sends

Organization SMTP passwords are encrypted before persistence. Password values are never returned by configuration APIs or exposed in logs.

### Verification and integrity

Every issued certificate receives a unique UUID verification code. The code is included in the email and resolves through:

```text
/verify/{verification-code}
```

The certificate stores immutable snapshots of:

- participant name
- event title
- organization name
- certificate title and style context
- issued timestamp
- generated artifact URL
- verification ID

A deterministic SHA-256 hash is calculated from the canonical certificate snapshot. The public verification page recomputes that hash before showing a certificate as verified. This keeps verification independent from later edits to the live event or participant record.

## Worker model

NameFrame uses one shared `certificate-pipeline` worker pool with a maximum of four active database leases.

The worker rule is global:

- if fewer than four slots are active, a new dispatcher invocation leases only the missing slots
- if all four slots are active, another request does not create a second set of four workers
- slots are claimed transactionally with `FOR UPDATE SKIP LOCKED`
- each lease has a heartbeat and expiry
- a worker releases its slot after draining available work
- stale work can be reclaimed after the configured lease/claim timeout

Each leased worker drains, in order:

1. certificate-generation jobs
2. primary email-delivery items
3. retry-queue delivery items

A worker claims at most five records per lane per batch, renews its lease between batches, and exits after repeated empty checks. Sending or retrying work creates the durable database rows first and then performs a state-driven worker wake. There is no recurring Vercel cron requirement.

## Throughput and benchmark evidence

### Measured synthetic worker run

The recorded engineering benchmark used 12 temporary jobs, 3 concurrent workers, a timed synthetic Cloudinary endpoint, and a synthetic email endpoint. Benchmark rows were removed after the run.

| Measure | Result |
| --- | ---: |
| Seed participants and jobs | 473 ms |
| Certificate-generation stage | 20.969 s |
| Delivery stage | 8.834 s |
| Total before cleanup | 30.483 s |
| Benchmark cleanup | 942 ms |
| Average synthetic Cloudinary call | 2.014 s |
| Average synthetic email call | 128 ms |
| Completed certificate jobs | 11 |
| Certificate jobs moved to retry | 1 |
| Sent deliveries | 10 |
| Deliveries still pending after injected failure | 1 |
| Recorded delivery attempts | 11 |
| Generation throughput | 0.52 completed jobs/s |
| Delivery throughput | 1.13 sent deliveries/s |

This run exercised disjoint claims, real database writes, retryable generation and delivery failures, timing collection, and cleanup. It is an engineering baseline, not a promise of fixed production throughput; real SMTP and Cloudinary latency will vary by account, region, image size, and provider limits.

### 1,000-item capacity mapping

The 1,000-item exercise should be read against the worker rules and the measured provider timings above:

- four coordinated slots are the maximum concurrent workers in the pool
- each worker claims five jobs at a time
- with a 2-second synthetic rendering call, the provider-time lower bound for 1,000 generations is approximately `1,000 × 2s ÷ 4 = 500s`, or about 8 minutes 20 seconds, before database and orchestration overhead
- using the measured 128 ms synthetic email-call average as a reference, provider-time for 1,000 sends maps to approximately `1,000 × 128ms ÷ 4 = 32s`, again excluding database, queue, retry, and provider-rate-limit overhead

These are capacity mappings from the recorded benchmark, not a fabricated claim that every 1,000-item run completes in exactly those wall-clock times. Production delivery should be measured separately with the organization’s SMTP route and provider limits enabled.

### Delivery reliability run

In the 300-mail reliability test:

- 298 messages completed cleanly on the first attempt: **99.33% first-pass success**
- 2 messages encountered one failure before retry handling
- 1 of those messages encountered a second failure
- failures were isolated to individual delivery records rather than taking down the batch
- retry state, attempt counts, and final status remained inspectable in the database

The result demonstrates isolated failure handling and retry visibility. It should not be interpreted as an inbox-delivery guarantee: provider acceptance and recipient mailbox delivery are different states.

## Data integrity and retry guarantees

- Participant uniqueness is enforced per event after normalization.
- Certificate uniqueness is enforced by `(eventId, participantId)`.
- Legitimate resends create new delivery work while reusing the immutable certificate artifact.
- Certificate issuance and initial delivery creation are persisted in a short transaction.
- Queue claims are ownership-checked so one worker cannot complete another worker’s claim.
- Queue retries preserve the original failure category and history.
- Provider calls consume attempts; local rate-limit waits and unavailable routes do not silently consume the send budget.
- Dead-letter records remain available for manual recovery.

The delivery model is at-least-once processing with idempotent certificate creation and durable attempt history. It does not claim exactly-once provider delivery.

## Security boundaries

- Clerk authenticates users.
- Every private event, participant, certificate, delivery, and organization query is organization-scoped.
- Leader-only operations protect SMTP configuration and organization invitations.
- SMTP secrets are encrypted at rest and never returned to clients.
- Worker routes require a separate `CRON_SECRET` bearer/header credential.
- Health checks use a separate `HEALTH_CHECK_SECRET`.
- API errors are classified and safe; provider credentials, stack traces, and database internals are not exposed.

## Application surfaces

- `/dashboard` — organization-wide operational metrics and analytics
- `/events` — searchable event index
- `/events/new` — event and certificate setup
- `/events/{eventId}` — event operations, participants, template, jobs, delivery status, and recovery
- `/templates` — searchable template library
- `/participants` — organization-wide participant directory and CSV export
- `/organization` — SMTP configuration and organization invitations
- `/verify` — public verification lookup
- `/verify/{verificationCode}` — verified certificate record and artwork
- `/contact` — collaboration/contact flow

## Technology

- Next.js 16 App Router and TypeScript
- React Server Components by default
- Regular CSS
- Clerk authentication
- Prisma 7 with PostgreSQL
- PostgreSQL-backed job and delivery state
- Cloudinary certificate rendering and asset storage
- Nodemailer SMTP delivery

## Local development

```powershell
npm.cmd install
npm.cmd run env:setup
npm.cmd run db:migrate
npm.cmd run dev
```

The application runs at `http://localhost:3000`.

Required production configuration is documented in `.env.example`. Secret values belong in the local environment or deployment secret store and must never be committed.

## Validation

```powershell
npm.cmd run db:validate
npm.cmd run db:generate
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:integration
npm.cmd run build
```

## Engineering position

NameFrame is a durable modular application for event-organizer workloads. PostgreSQL is the source of truth for operational state; Cloudinary stores certificate artifacts; workers process durable jobs with bounded concurrency; and the user-facing workspace exposes progress, failure, retry, and verification state without requiring direct database or provider-console access.
