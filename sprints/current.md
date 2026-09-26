# Current Sprint

## Active sprint

Sprint 08 — Dashboard, Operational Visibility & Manual Recovery (in progress)

## Progress

- Began the user-directed Sprint 08 UI pass using the sibling `../nameframe` checkout as the visual reference: rebuilt the landing page with reused product/certificate assets, a calmer interactive designer, expanded event-team stories, improved FAQ/CTA, and the adapted oversized footer.
- Reworked the public landing page from the supplied Google Stitch reference into a warm editorial system using the supplied NameFrame logo, EB Garamond/Plus Jakarta Sans typography, restrained archival surfaces, truthful product copy, and real application routes.
- Corrected the landing implementation against the supplied full-page Stitch screenshot: restored its exact section sequence and visual hierarchy, including the compact navigation, studio hero, metrics band, six-step workflow, architecture inset, preview studio, dark reliability block, testimonial grid, split FAQ, centered CTA, and oversized footer wordmark.
- Preserved functional landing interactions: Clerk-aware entry CTAs, the live certificate placement preview, accessible FAQ accordion, responsive layouts, and reduced-motion fallbacks.
- Added a light application workspace for dashboard, event list, event overview, participant management, certificate templates, and event creation; added the organization template library at `/templates`.
- Rebuilt the authenticated workspace around a persistent responsive sidebar with Dashboard, Events, Templates, Participants, and Organization navigation, browser-style back/forward controls, and account/sign-out access at the bottom.
- Reworked the dashboard hierarchy so the organization and member role are secondary context rather than the page headline, removed the visible account email and redundant All Events action, and added icon-led organization metrics plus compact eligibility and delivery summaries.
- Added organization-wide participant and organization overview pages so every primary sidebar destination is functional.
- Restructured event creation into an ergonomic four-step workspace: event details, separated email content, template management, and review/create. Draft and Active are explicit creation choices; deletion remains a lifecycle action rather than a selectable creation status.
- Rebuilt template management with drag-and-drop or browse upload, a non-circular progress treatment, starter-template carousel and Canva handoff links, improved typography/color/alignment controls, and clear validation that directs users to configure a template before activation.
- Added a live event summary preview covering organization identity, event details, certificate title, location, status, and participant count, while preserving the existing autosave and event APIs.
- Tightened event creation after visual review: the complete event card now leads the page, the oversized draft-title header and four-step sidebar were removed, hierarchy and field spacing were reduced, and progress is represented by three linked completion dots.
- Matched the compact template controls to the certificate stage, removed the redundant immutable-background explanation, and replaced the separate review/status panel with a direct Save as draft, Cancel, and Activate action row.
- Corrected the dashboard unique-participant aggregate to address the configured `sertify` PostgreSQL schema explicitly; the live query now succeeds instead of resolving an unrelated public-schema table.
- Rebuilt the event index as a compact, searchable management list: removed certificate thumbnails and oversized rows, made the organization logo the primary visual identity, added icon-backed participant/date/location/certificate metadata, and added server-side search across event and organization fields.
- Rebuilt the template library as a compact searchable index with event, creation date, creator, participant count, and lifecycle context; template actions now return to the inline event editor.
- Consolidated event management into one operational page with branded event identity, icon-led KPIs, a merged worker activity timeline, embedded participant management, inline event settings, and inline certificate-template editing.
- Participant management now exposes single and spreadsheet bulk addition, drag-and-drop imports, three quick KPIs, server-backed search/filtering, 25-row pagination, a ten-row internal viewport, and real individual or bulk certificate-send controls with live job/delivery states.
- Added typed COMPLETE and DELETE lifecycle confirmations, reorganized the event editor into paired fields, and strengthened the visible Cancel action on event creation.
- Refined the event dashboard hierarchy after visual feedback: KPI cards now use a vertical value-first composition with restrained semantic color families, and the inline event template editor has a dedicated compact presentation that leaves the event-creation editor unchanged.
- Increased event and template row scale for readability, rebuilt `/participants` as an organization-wide searchable directory with safe CSV export, and redirected the obsolete event participant/template subpages to their embedded event sections.
- Applied the attached Atelier reference as a visual system rather than copying its controls or content: application UI now uses Inter for working text, Outfit for headings and KPI values, JetBrains Mono for operational labels, warmer ivory/espresso surfaces, restrained gold/sage/crimson accents, stronger card hierarchy, and more readable event/template/participant rows.
- Added leader-only organization SMTP configuration controls over the encrypted Sprint 06 APIs, plus Clerk-backed organization invitation create/list/revoke APIs and automatic local member attachment when an invited user signs in.
- Added event operational summary/query APIs and UI foundations for organization metrics, event metrics, bulk progress, certificate-job visibility, delivery queues/attempts, safe provider status, and manual retry controls.
- Diagnosed the local pending-delivery path: send initiation persisted work correctly, but no scheduler invoked the certificate worker. Single, bulk, and manual dead-letter retries now check for runnable database work and wake one database-coordinated certificate pipeline after returning `202`; no recurring Vercel cron is configured.
- Added a global four-slot `WorkerLease` pool shared by every user and request. Concurrent send requests atomically lease only missing slots with `FOR UPDATE SKIP LOCKED`; each leased worker drains generation, primary Nodemailer delivery, and retries, renews its lease between batches, idles briefly for dependent work, and releases the slot safely.
- Added development-only worker benchmarking above event participants. It writes real temporary jobs, exercises concurrent database claims and issuance/delivery transactions against timed fake Cloudinary and email endpoints, reports API/provider/per-worker timings and throughput, injects retryable failures on demand, and removes every benchmark row afterward.
- Added certificate artifact links to corresponding certificate and email entries in the event activity timeline, and corrected Resend 403 sender/recipient rejections so they are no longer misreported as authentication failures.
- Manually reproduced the `notharsh05@gmail.com` flow: generation completed, but Resend test mode rejected the recipient because the account only permits `cloudharsh24@gmail.com` until a sending domain is verified. The exact smoke-test participant, job, delivery, attempt, and Cloudinary artifact were removed afterward.
- Reworked sign-in and sign-up into a responsive split layout while keeping Clerk responsible for authentication UI and behavior.
- Sprint 09 was completed before Sprints 07 and 08 by explicit user direction, with no UI changes.
- Audited every private API for authentication, organization ownership, and established leader/member role checks; protected event, job, and delivery reads are organization-scoped at query time.
- Added lightweight per-user, per-instance rate limits to event creation and single, bulk, and manual retry send initiation. Durable Sprint 06 provider limits remain authoritative.
- Added `GET /api/internal/health`, protected by a distinct `HEALTH_CHECK_SECRET`, with safe application, database, Cloudinary, site SMTP, and Resend status reporting.
- Added the delivery API middleware boundary, retained `CRON_SECRET` on all three worker endpoints, and sanitized unexpected-error logging and responses.

- Sprint 03 closed with Prisma validation, applied migrations, TypeScript, lint, 17 unit tests, live PostgreSQL/Cloudinary integration, a 10,000-row import, production build, and unauthenticated route-boundary smoke checks.
- Participant CRUD, soft deletion/restoration, event-scoped uniqueness, search, pagination, eligibility filtering, and counts are implemented.
- CSV/XLSX files are parsed in the browser with alias-based column recognition, preview statuses, duplicate detection, and bounded persistence batches.
- Concurrent participant uniqueness failures map to structured conflicts; malformed participant payloads map to validation errors.
- Sprint 04 closed with Prisma validation, applied migration, TypeScript/build validation, lint, 20 unit tests, the complete live integration suite, and production-route smoke checks.
- Added `nextAttemptAt`, six-attempt defaults, event-scoped request idempotency, and worker-query indexes.
- Added atomic bulk/single certificate-job creation, database-derived bulk progress, manual dead-job retry, and a deterministic stub processor.
- Worker invocations recover stale claims, atomically claim at most five jobs using `FOR UPDATE SKIP LOCKED`, isolate per-job outcomes, and enforce claim ownership on completion.
- Two concurrent workers claimed five distinct jobs each; retry exhaustion, permanent failure, stale recovery, and wrong-owner completion rejection passed.
- The internal worker route rejected an invalid secret with `401` and accepted the configured `CRON_SECRET` with `200`.
- Sprint 05 closed with the applied issuance migration, TypeScript/build validation, lint, 25 unit tests, the complete live integration suite, and live Cloudinary PNG retrieval.
- Replaced the stub default worker processor with the real Cloudinary certificate renderer while retaining processor injection for deterministic worker tests.
- Added normalized-coordinate conversion, deterministic font reduction to an 8px minimum, and permanent failure when a name still cannot fit.
- Added secure UUID verification IDs, immutable certificate/style/artifact snapshots, and deterministic SHA-256 certificate hashes.
- Added database-safe one-certificate-per-event/participant issuance, deterministic Cloudinary public IDs, resend reuse, and concurrency race recovery.
- Successful issuance atomically creates one `PENDING` delivery per source certificate job, snapshots recipient/subject/body, and completes the claimed job.
- Generation errors now distinguish retryable Cloudinary/network failures from permanent event, participant, template, and rendering failures.
- Single and bulk asynchronous creation endpoints now return `202 Accepted`.
- Sprint 06 closed as a backend-only increment with the applied delivery-queue migration, protected worker and SMTP APIs, 28 unit tests, the complete live integration suite, lint, TypeScript, and production build passing.
- Added structurally separate `PrimaryDeliveryQueueItem`, `RetryDeliveryQueueItem`, and `DeliveryDeadLetter` tables; Sprint 05 issuance now creates the primary queue row atomically.
- Added separate primary and retry workers with five-row `FOR UPDATE SKIP LOCKED` claims, independent item failure isolation, persisted delays, and five-minute stale-claim recovery.
- Automatic delivery is bounded to two primary provider calls plus two backup calls; promotion to retry and DLQ is transactional.
- Added organization SMTP, site SMTP, and Resend adapters with organization SMTP preferred, then site SMTP, then Resend.
- Added leader-only SMTP configuration/validation APIs, encrypted credentials, safe metadata responses, send limits, and per-minute rate limits.
- Added provider health state with organization-scoped SMTP routes, global site/Resend routes, five-failure cooldowns, and success reset.
- Certificate links are always included; bounded PNG attachment retrieval falls back to link-only delivery without consuming an extra attempt.
- DEAD deliveries can be manually retried by organization members while historical attempts and resolved DLQ entries remain intact.

## Important decisions

- `OrganizationMember` remains the authorization record while `User.organizationId` is maintained transactionally.
- The sibling `../nameframe` checkout is the UI reference called `Namespace/` by the sprint specifications.
- Participant email is trimmed and lowercased before event-scoped uniqueness checks.
- Recreating a soft-deleted participant restores the existing row instead of creating a conflicting historical duplicate.
- Imports accept at most 10,000 rows, use 500-row persistence batches, and skip active event duplicates by default.
- Bulk requests are unique by `(eventId, operationRequestId)`; job requests are unique by `(eventId, participantId, requestId)`.
- `DEAD` jobs remain in `CertificateJob`; manual retry resets attempt/claim/error fields and returns the same job to `PENDING`.
- Retry backoff is deterministic: 30 seconds, 2 minutes, 10 minutes, 20 minutes, then 30 minutes.
- Certificate artifacts use `certificates/{eventId}/{participantId}` and overwrite that stable identity on pre-persistence retry instead of creating duplicate assets.
- Certificate uniqueness is enforced by `(eventId, participantId)`; delivery retry idempotency is enforced by unique `sourceCertificateJobId`, which still permits later resends through new jobs.
- Cloudinary work occurs before the short issuance transaction; the transaction owns certificate creation/reuse, delivery creation, and job completion.
- The participant name overlay adapts the previous NameFrame Cloudinary text-overlay mechanics; QR generation remains intentionally deferred.
- Delivery queues are physical PostgreSQL tables rather than status-only views over `Delivery`.
- Queue claims do not consume attempts; only a real provider send call creates and increments `DeliveryAttempt`.
- Local rate-limit waits and unhealthy-provider skips leave work queued without consuming the 2+2 attempt budget.
- Nodemailer and Resend are the only Sprint 06 dependency additions; provider details stay behind the shared email adapter contract.
- Provider priority remains organization SMTP through Nodemailer, then site SMTP through Nodemailer, then Resend fallback. The earlier live Resend attempt occurred only because no active organization or site SMTP route was configured.
- UI files and styles were intentionally untouched during Sprint 06.
- Sprint 09 rate limits are deliberately best-effort per Vercel instance and use a shared process-local map; no distributed infrastructure was added.
- Missing optional provider configuration is reported as `not_configured` without degrading health; an unreachable database returns a safe degraded response with HTTP 503.
- `HEALTH_CHECK_SECRET` is separate from both Clerk authentication and `CRON_SECRET`.
- The UI reference is adapted without importing its Tailwind/Framer Motion/icon dependency stack; the rewrite uses regular CSS, small inline SVGs, `next/image`, and reduced-motion fallbacks.
- The application workspace uses restrained light metallic surfaces; the shared base font is Plus Jakarta Sans and the public landing adds EB Garamond for editorial display type.
- The authenticated workspace now shares the public brand's warm ivory/espresso editorial system while keeping denser controls and operational information appropriate for an application surface.
- The supplied Stitch HTML is treated as visual direction only: unsupported QR, ledger, bounce/open tracking, vector-PDF, and delivery-rate claims were deliberately excluded.

## Validation notes

- An interactive Clerk-authenticated browser walkthrough still requires a user login session.
- The production server returned `200` for sign-in and correctly redirected protected event and participant API routes with `307`.
- Browser automation CLI was unavailable, so no visual or console-driven browser check was recorded.
- Sprint 04 production build includes bulk/single job routes, manual retry, and the protected internal certificate worker route.
- Sprint 05 migration applied successfully to the configured PostgreSQL `sertify` schema.
- Live Cloudinary verification generated a deterministic PNG, retrieved it successfully as `image/png`, and confirmed 1200x850 artifact metadata.
- New issuance, resend reuse, retry-to-success, permanent failure, deterministic crash retry, and concurrent issuance protection all passed against PostgreSQL.
- `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run test:integration`, and `npm.cmd run build` pass.
- Sprint 06 migration applied successfully to the configured PostgreSQL `sertify` schema.
- Organization/site/Resend routing, encrypted SMTP persistence, safe metadata, certificate links, PNG/link-only behavior, primary/retry/DLQ transitions, manual retry, provider health, rate/send limits, concurrent claims, and stale recovery passed.
- Both new delivery worker routes reject an invalid `CRON_SECRET`; the production build includes all SMTP, retry, and worker endpoints.
- `npm audit --omit=dev` reports four high-severity transitive advisories through the Prisma CLI dependency tree; the suggested automatic fix is a Prisma major-version downgrade and was not applied during Sprint 06.
- Sprint 09 closed with Prisma validation, TypeScript, lint, 34 unit tests, the complete Sprint 01–06 plus Sprint 09 integration suite, and the Next.js production build passing.
- The valid health credential reported the live PostgreSQL database as healthy; invalid health credentials and invalid credentials for all three worker endpoints returned `401` without leaking secrets.
- The complete landing/auth/light-workspace pass passes TypeScript, lint, 37 unit tests, the Sprint 01-06 plus Sprint 09 live integration suite, and the Next.js production build.
- The Stitch-inspired landing revision passes TypeScript, ESLint, and the Next.js 16.3.6 production build; no new runtime dependency was added.
- Production-server smoke checks returned `200` for landing, sign-in, sign-up, and reused assets; dashboard, events, templates, and event creation correctly redirect unauthenticated requests to sign-in.
- The corrected Stitch landing was rendered from the live Next.js development server in local headless Chrome at 1440px and visually compared with the supplied full-page reference; the public route returned `200` with the hero, workflow, and CTA content present.
- The completed authenticated-workspace pass passes repository-wide TypeScript, ESLint, all 37 unit tests, the full Sprint 01-06 plus Sprint 09 live integration suite, and the Next.js 16.3.6 production build.
- The development server is running at `http://localhost:3000`; a direct reachability check returned HTTP 200. Authenticated visual QA remains pending because the available browser session is signed out, and authentication screens were intentionally left unchanged for this pass.
- Refreshed the Clerk sign-in and sign-up presentation with a compact NameFrame editorial shell, warmer branded surfaces, stronger form hierarchy, tighter spacing, and responsive mobile framing. Clerk authentication behavior remains unchanged.
- The compact template and unified event-management revision passes TypeScript, ESLint, and all 37 unit tests. The authenticated event route compiled and returned HTTP 200 from the running development server; visual QA remains pending on a signed-in browser session.
- The enlarged index/directory and organization-controls pass passes TypeScript, ESLint, and all 37 unit tests. Authenticated development requests returned HTTP 200 for events, templates, participants, organization, and invitation listing; no invitation email or SMTP connection was submitted during validation.
- Added a public `/contact` collaboration page adapted from the previous NameFrame contact flow: feature request form, topic selection, social/contact constellation, office details, quick-message guidance, and secure server-side SMTP submission. The landing navigation/footer now link to it. TypeScript, ESLint, production build, and `/contact` HTTP 200 pass.
- Removed the development-only benchmark API routes and benchmark implementation from the production tree. Preserved the normal unit/integration checks.
- Nodemailer remains the primary SMTP adapter behind provider routing. When current `SITE_SMTP_*` values are absent, the route now supports the legacy NameFrame `EMAIL_USER`/`EMAIL_PASSWORD` variables as a Gmail SMTP route without exposing credentials.
- Implemented the public certificate verification pipeline using the existing immutable certificate UUID as the unique verification code. Delivery emails now include the code and `/verify/{code}` link; `/verify` lookup and `/verify/[verificationId]` render verified snapshots, integrity failures, or not-found states with inline certificate artwork. The flow does not depend on live event or participant records.
- A real Nodemailer verification/send attempt to `hbd031204@gmail.com` reached Gmail but was rejected with `535 BadCredentials`; no message was accepted. The existing queued delivery was observed retrying and safely recording `EMAIL_PROVIDER_AUTH_ERROR`. Localhost is running at `http://localhost:3000`; typecheck, lint, production build, and HTTP 200 pass.
- The worker-observability pass passes Prisma validation, TypeScript, ESLint, 38 unit tests, the complete Sprint 01–06 plus Sprint 09 integration suite, and the Next.js 16.3.6 production build. A 12-job/3-worker development benchmark verified disjoint 5/5/2 claims, retryable generation and delivery failures, real transactional writes, measured provider/worker timing, and complete cleanup of 12 participants, 12 jobs, and 11 deliveries.
- Localhost now runs the web application and bounded local workers together. Live logs confirmed successful protected invocations of all three worker routes; authenticated visual verification remains blocked only because the available browser session is signed out.
- The worker-lease migration is applied. Ten simultaneous dispatcher acquisitions produced exactly four unique active worker slots, rejected further acquisition while full, and reused all four slots after release. Prisma validation, TypeScript, ESLint, 38 unit tests, the complete integration suite, and the production build pass with the consolidated dispatcher.
- The Atelier typography and hierarchy pass passes TypeScript, ESLint, and the Next.js production build. The authenticated browser session reached dashboard, events, templates, and the event workspace during local verification; the visual pass is now running at localhost:3000.
- Removed the organizer-facing worker-throughput benchmark component from the event workspace while retaining internal benchmark APIs for engineering tests.
- Delivery UI now distinguishes provider acceptance from inbox delivery, surfaces unavailable-provider guidance in participant rows, and orders latest work by update time so pending/retry states refresh correctly.
- Landing metrics now use evidence-based synthetic throughput wording, and workflow, trust, FAQ, and metric cards received a larger bordered visual hierarchy. TypeScript, ESLint, production build, and localhost HTTP 200 pass after this pass.
- Hardened public verification input: pasted verification labels, full `/verify/...` links, URL-encoded values, whitespace, and case differences are normalized before the UUID/database lookup. The latest live certificate link was verified directly; TypeScript, ESLint, and all 39 unit tests pass.
- Capped the event-management Recent certificate runs activity viewport at a fixed height with an internal scroll area, preserving the page layout as new worker activity arrives.
- Added dashboard visual analytics from existing organization aggregates: delivery-mix doughnut, sent/in-progress/attention legend, and participant-volume bars for the five latest events. No synthetic throughput or timing values were added.
- Added the product title and basic SEO metadata for NameFrame, plus public robots and sitemap routes that keep authenticated workspace and API paths out of indexing.
- Reused the original NameFrame favicon geometry from the sibling implementation and added a white 32px `icon.png` for the Next.js app icon.

## Future improvements

- Add a reusable authenticated end-to-end browser fixture for organization-member UI flows.
- Consider PostgreSQL trigram indexes only if measured participant substring-search performance requires them.
- Consider provider-side text metrics only if production fonts require more exact fitting than the current conservative deterministic estimator.
- Configure real site SMTP and/or Resend deployment credentials before enabling scheduled production delivery invocations.
- Reassess the Prisma CLI transitive advisories when an upstream-compatible patched release is available; do not force-downgrade the current Prisma 7 stack.

## Next implementation area

Continue Sprint 08 with the remaining authenticated visual review and any focused usability corrections discovered there. Keep Sprint 07 deferred and do not broaden the current UI pass into future sprint functionality.
