# Sertify

Sertify is a ground-up rewrite of NameFrame focused on reliable certificate generation and delivery workflows. Sprint 1 established the application and durable-state foundation. Sprint 2 added organization setup, resumable event drafts, Cloudinary-backed certificate backgrounds, normalized name placement, and event/template editing. Sprint 3 added participant management and browser-side CSV/XLSX import. Sprint 4 adds PostgreSQL-backed certificate jobs and a protected Vercel-triggered worker runtime. Certificate rendering and email execution remain out of scope.

## Stack

- Next.js 16 App Router and TypeScript
- React Server Components by default
- Regular CSS
- Clerk authentication
- Prisma 7 with PostgreSQL
- PostgreSQL-backed durable job state
- Cloudinary image storage

## Local setup

Install dependencies and prepare local credentials:

```powershell
npm.cmd install
npm.cmd run env:setup
```

`env:setup` copies the existing sibling NameFrame credentials into the ignored local `.env` and generates the Sertify-only encryption key if missing. Secret values are never committed.

Sertify reuses the same PostgreSQL server but isolates all tables and Prisma migration history in the `sertify` PostgreSQL schema. The original NameFrame schema is not modified.

Apply migrations and start development:

```powershell
npm.cmd run db:migrate
npm.cmd run dev
```

The existing Clerk application can be reused. Configure its webhook endpoint for:

```text
POST /api/webhooks/clerk
```

Subscribe to `user.created` and `user.updated`. Authenticated requests also have a safe fallback that creates a missing local user; the webhook remains the primary synchronization path.

## Environment

See `.env.example`. Production and Vercel environments require:

- `DATABASE_URL` for the pooled/runtime connection
- `DIRECT_URL` for Prisma migrations, when provided by the database platform
- Clerk publishable, secret, and webhook keys
- `APP_CREDENTIAL_ENCRYPTION_KEY`, decoding to exactly 32 bytes
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`

Optional delivery configuration is documented in `.env.example`. Organization SMTP passwords are encrypted in PostgreSQL; site SMTP and Resend credentials remain server-only environment variables.

## Sprint 2 workflow

- `/organization/setup` creates the single organization and sole group leader.
- `/events/new` creates or resumes the leader's one live draft and auto-saves event fields.
- Server-validated uploads become asset records before a template can consume them.
- Template bounds are normalized from `0` to `1`; backgrounds cannot be replaced in place.
- Event reads are server-rendered. Members may edit; completion and typed-confirmation deletion are leader-only.

## Sprint 3 workflow

- `/events/{eventId}/participants` provides organization-scoped participant CRUD, search, pagination, eligibility filtering, and live counts.
- CSV and XLSX files are parsed in the browser; raw spreadsheets are not uploaded or stored.
- Import preview reports invalid rows, warnings, duplicates, and eligibility before confirmation.
- The backend validates normalized rows again and persists up to 10,000 participants in bounded batches.
- Participant emails are normalized per event, and recreating a soft-deleted participant restores its historical row.

## Sprint 4 worker foundation

- Bulk and single certificate-job creation use request IDs for database-enforced idempotency.
- PostgreSQL claims at most five jobs per invocation with `FOR UPDATE SKIP LOCKED`.
- The worker records attempts, applies increasing retry delays, recovers claims stale for five minutes, and uses `DEAD` as the inspectable dead-letter state.
- The worker now invokes the Sprint 5 Cloudinary certificate processor; the stub remains available only for deterministic infrastructure tests.
- `POST /api/internal/workers/certificates` requires `Authorization: Bearer <CRON_SECRET>` (or `x-cron-secret`).

## Sprint 5 issuance

- Cloudinary generates deterministic PNG artifacts with participant-name fitting and stable public IDs.
- Certificate snapshots, verification UUIDs, integrity hashes, and one delivery per source job are persisted atomically.
- Repeated sends reuse the immutable event/participant certificate while creating a new delivery.

## Sprint 6 delivery pipeline

- Separate PostgreSQL tables hold primary queue, retry queue, and dead-letter records.
- `POST /api/internal/workers/delivery-primary` and `POST /api/internal/workers/delivery-retry` require `CRON_SECRET` and claim at most five rows independently.
- Provider order is organization SMTP, site SMTP, then Resend. Automatic sending is bounded to two primary plus two backup attempts.
- Provider health, cooldowns, per-minute limits, send limits, attempt history, and manual dead-letter retries are persisted.
- SMTP configuration APIs are leader-only and never return password data.

## Sprint 9 basic hardening

- Private APIs require Clerk authentication and enforce organization ownership before accessing protected resources.
- Event creation and send-initiation POSTs have configurable best-effort, per-instance in-memory rate limits; durable provider limits remain authoritative.
- `GET /api/internal/health` requires `Authorization: Bearer <HEALTH_CHECK_SECRET>` and reports only safe application, database, and provider-configuration statuses.
- Certificate and delivery worker endpoints continue to require the separate `CRON_SECRET`.

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
