# Sprint 03 — Participant Management & Browser-Side Import Pipeline

## Objective

Implement participant management for existing events.

This sprint should deliver:

- manual participant creation
- participant editing
- participant deletion
- participant listing
- participant search
- participant pagination
- participant eligibility management
- CSV import
- XLSX import
- browser-side parsing
- fuzzy column recognition
- import preview
- row validation
- duplicate detection
- batched participant persistence
- event participant counts
- clear participant/import error handling
- sprint-end production validation

Do not implement certificate generation, delivery jobs, email sending, queue workers, or verification in this sprint.

Refer to `AGENTS.md` before implementation.

Reuse the previous `Namespace/` implementation where useful for:

- participant table UI
- modal/form structure
- CSS
- event detail integration
- import interaction patterns

Do not reuse old backend logic blindly.

---

# 1. Participant Model

Use the Sprint 01 participant entity.

Required persisted fields:

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

## Business Uniqueness

Participant uniqueness remains:

```text
(eventId, email)
```

Email is therefore required for persisted participants.

The internal database ID exists only for relations and internal operations.

Do not expose the internal ID as the user's logical participant identity unless needed by the UI/API.

---

# 2. Participant Authorization

Both:

```text
GROUP_LEADER
GROUP_MEMBER
```

may:

- view participants
- add participants
- edit participants
- remove participants
- import participants
- change certificate eligibility

Every operation must verify:

```text
authenticated user
        ↓
organization membership
        ↓
event belongs to organization
        ↓
participant belongs to event
```

Do not authorize participant operations using only a participant/event ID supplied by the client.

---

# 3. Manual Participant Creation

Manual participant creation should remain intentionally simple.

Fields:

```text
name
email
eligibleForCertificate
```

Default:

```text
eligibleForCertificate = true
```

Validation:

- name required
- email required
- email must be valid
- duplicate `(eventId, email)` must fail

Duplicate creation should return a structured conflict error.

Suggested error:

```text
PARTICIPANT_ALREADY_EXISTS
```

Do not silently update an existing participant during manual creation.

---

# 4. Participant Editing

Allow editing:

```text
name
email
eligibleForCertificate
```

If email changes:

- validate the new email
- ensure `(eventId, newEmail)` does not already exist
- return conflict if another participant already uses it

Do not mutate issued certificates in later sprints when participant data changes.

Historical certificate snapshots remain independent.

---

# 5. Participant Deletion

Use soft deletion.

A removed participant should:

- disappear from normal participant queries
- not be eligible for future certificate sending
- remain available for historical relations where required

Do not hard-delete participant rows that may later be referenced by certificate or delivery history.

---

# 6. Participant List UI

Add participant management to the event detail experience.

Suggested route/section:

```text
/events/{eventId}/participants
```

or equivalent event-detail tab.

The screen should support:

- participant table
- add participant
- edit participant
- remove participant
- import participants
- search
- pagination
- eligibility visibility/filtering

Reuse the previous NameFrame UI where practical.

---

# 7. Participant Table

Display at minimum:

```text
Name
Email
Certificate Eligibility
Actions
```

Actions:

```text
Edit
Remove
```

Eligibility should be visually clear.

Avoid excessive UI controls in each row.

---

# 8. Search

Support server-side participant search by:

```text
name
email
```

Search should be case-insensitive.

Do not load the entire participant set into the browser just to search it.

---

# 9. Pagination

Use server-side pagination.

Recommended default:

```text
50 participants/page
```

Support stable ordering.

Suggested default order:

```text
createdAt DESC
```

or another predictable order already used in the current UI.

Do not fetch all participants for events that may contain thousands of records.

---

# 10. Participant Counts

Expose event-level participant metadata:

```text
totalParticipants
eligibleParticipants
ineligibleParticipants
```

These may be derived through database queries.

Do not add redundant counters to the Event row unless measurements later justify it.

These counts will later support dashboard and certificate-send flows.

---

# 11. Import File Types

Support:

```text
.csv
.xlsx
```

Do not support additional spreadsheet formats in Sprint 03.

Set a reasonable upload/file-size limit.

The limit should safely support the target scale of approximately:

```text
10,000 rows/import
```

Do not design for million-row spreadsheet ingestion in this sprint.

---

# 12. Import File Storage

The original spreadsheet file must not be permanently stored.

Flow:

```text
User selects file
        ↓
Browser parses file
        ↓
Browser normalizes columns
        ↓
Browser validates rows
        ↓
Preview shown
        ↓
User confirms
        ↓
Validated normalized participants sent to backend
        ↓
Backend validates again
        ↓
Batch persist
```

After parsing, the original file is not uploaded to permanent storage.

Do not save the raw CSV/XLSX file to Cloudinary or PostgreSQL.

---

# 13. Browser-Side Parsing

Parsing happens in the browser.

Reasons:

- immediate preview
- no unnecessary raw-file upload
- reduced backend work
- straightforward user correction before persistence

Use existing spreadsheet dependencies where available.

Avoid adding a new parsing dependency if the project already includes a suitable library.

Important:

> Browser validation is not trusted as the final authority.

The backend must validate the normalized payload again before persistence.

---

# 14. Column Recognition

Do not require perfectly exact spreadsheet headers.

Implement lightweight fuzzy/alias recognition.

At minimum recognize reasonable variations for:

## Name

Examples:

```text
name
full name
participant name
participant
student name
candidate name
```

## Email

Examples:

```text
email
email address
email id
mail
participant email
```

## Attendance / Eligibility

Examples:

```text
present
attendance
attended
participated
eligible
certificate eligibility
```

Normalization should be:

- case-insensitive
- trimmed
- tolerant of spaces/underscores/hyphens

Do not implement heavyweight AI/fuzzy matching.

Use a small explicit alias map and normalization rules.

If multiple columns ambiguously map to the same field, surface the ambiguity instead of guessing recklessly.

---

# 15. Required Import Fields

Required:

```text
name
email
```

Optional:

```text
attendance / eligibility
```

If no attendance/eligibility column exists:

```text
eligibleForCertificate = true
```

If the attendance column exists, derive eligibility from its value.

---

# 16. Attendance / Eligibility Parsing

Support common truthy values such as:

```text
yes
y
true
1
present
attended
eligible
✓
checked
```

Support common false-like values such as:

```text
no
n
false
0
absent
ineligible
x
cross
blank
null
```

Comparison should be:

- case-insensitive
- whitespace-trimmed

Unknown values should not silently become true.

Preferred behavior:

```text
unknown attendance value
        ↓
mark row with warning
        ↓
default eligibleForCertificate = false
```

The preview should make this visible.

---

# 17. Import Validation

Each parsed row should be classified before confirmation.

Possible result categories:

```text
VALID
WARNING
INVALID
DUPLICATE_IN_FILE
DUPLICATE_IN_EVENT
```

Validation examples:

## Invalid

```text
missing name
missing email
invalid email format
```

## Warning

```text
unknown attendance value
extra ignored columns
```

## Duplicate In File

Same normalized email occurs multiple times in the uploaded file.

## Duplicate In Event

Participant already exists in the event.

---

# 18. Duplicate Handling

## Duplicate Inside Uploaded File

Use the first valid occurrence.

Later rows with the same normalized email should be marked:

```text
DUPLICATE_IN_FILE
```

Do not import duplicate copies.

## Duplicate Already In Event

Default behavior:

```text
SKIP
```

Do not automatically overwrite existing participant data during import.

Show the duplicate clearly in preview.

Updating existing participants through import is out of scope for Sprint 03.

---

# 19. Import Preview

Before persistence, show a summary such as:

```text
Total rows
Valid rows
Warnings
Invalid rows
Duplicates
Eligible participants
Ineligible participants
```

Also show row-level status where practical.

Suggested preview columns:

```text
Name
Email
Eligibility
Status
Message
```

The user should understand exactly what will and will not be imported.

---

# 20. Import Confirmation

When the user confirms:

- send only normalized valid rows to the backend
- do not send ignored raw spreadsheet columns
- do not send duplicate-in-file rows
- do not send existing-event duplicates
- backend validates every row again
- backend verifies event ownership again
- backend persists participants in batches

Do not send one API request per participant.

---

# 21. Batch Persistence

Persist confirmed participants using batched database operations.

The implementation should support approximately:

```text
10,000 participants/import
```

without requiring thousands of client-server requests.

Prefer straightforward batch persistence.

Use transactions where appropriate for consistency, but do not create one unnecessarily enormous fragile transaction if the database/provider makes bounded batches safer.

If a batch fails:

- return a structured failure
- do not pretend the entire import succeeded
- preserve enough information for the user to understand the result

Keep the implementation simple and measurable.

---

# 22. Import Response

Return a concise result such as:

```text
requestedCount
insertedCount
skippedCount
failedCount
```

Do not expose raw Prisma/database errors.

The UI should display a useful completion summary.

---

# 23. No Import Job Entity

Do not create a background import-job system in Sprint 03.

Use:

```text
browser parsing + preview
        ↓
batched backend persistence
```

The expected scale does not currently justify introducing another asynchronous pipeline.

If later measurements show imports are too slow, the architecture can be revisited.

---

# 24. Bulk Participant Actions

Keep Sprint 03 participant operations simple.

Required:

- manual add
- edit
- remove
- import
- individual eligibility update

Do not add complicated bulk-selection workflows unless the previous UI already provides them cleanly at negligible cost.

Bulk eligibility and bulk delete may be added later if actual use requires them.

---

# 25. Eligibility Contract

Only participants where:

```text
eligibleForCertificate = true
```

may enter future certificate generation/send operations.

Sprint 03 does not create certificate jobs.

However, participant APIs and queries should make eligibility easy to filter so later sprints can reliably select only eligible participants.

---

# 26. Recommended API Surface

Exact Next.js route structure may follow existing project conventions.

Behavior should roughly support:

## Participants

```text
GET    /api/events/:eventId/participants
POST   /api/events/:eventId/participants
PATCH  /api/events/:eventId/participants/:participantId
DELETE /api/events/:eventId/participants/:participantId
```

## Import

```text
POST /api/events/:eventId/participants/import
```

The import endpoint receives normalized validated participant data, not the original CSV/XLSX file.

Do not create a raw-file upload endpoint for participant import.

---

# 27. Participant List Query Parameters

Support query parameters such as:

```text
page
limit
search
eligibility
```

Example:

```text
GET /api/events/:eventId/participants?page=1&limit=50&search=harsh
```

Eligibility filter may support:

```text
eligible
ineligible
all
```

Validate pagination bounds.

Do not allow arbitrarily huge page sizes.

---

# 28. Error Model

Use Sprint 01 error conventions.

Add domain-specific codes such as:

```text
PARTICIPANT_NOT_FOUND
PARTICIPANT_ALREADY_EXISTS
INVALID_PARTICIPANT_NAME
INVALID_PARTICIPANT_EMAIL

IMPORT_INVALID_FILE
IMPORT_UNSUPPORTED_FORMAT
IMPORT_TOO_LARGE
IMPORT_MISSING_NAME_COLUMN
IMPORT_MISSING_EMAIL_COLUMN
IMPORT_AMBIGUOUS_COLUMN_MAPPING
IMPORT_NO_VALID_ROWS
IMPORT_BATCH_FAILED
```

Browser-specific parsing errors should also be shown clearly.

Do not collapse every import problem into:

```text
Something went wrong
```

---

# 29. Validation Rules

Backend validation must enforce:

```text
name is non-empty
email is non-empty
email format is valid
eligibleForCertificate is boolean
participant event exists
event is not deleted
authenticated user belongs to event organization
(eventId, email) is unique
```

Normalize emails before comparison where appropriate.

At minimum:

```text
trim
lowercase for uniqueness/comparison
```

Do not rely on browser validation alone.

---

# 30. Soft Delete Query Rules

Normal participant queries must exclude:

```text
deletedAt != null
```

When recreating a participant with an email that belongs to a soft-deleted participant, choose a consistent implementation.

Recommended behavior:

```text
restore/update the soft-deleted participant
```

rather than creating a second row that violates historical uniqueness.

Document whichever approach is implemented in `current.md`.

---

# 31. UI States

The participant screen/import flow should represent:

```text
Loading participants
No participants
Searching
Adding participant
Editing participant
Deleting participant

Parsing file
Parsing failed
Preview ready
No valid rows
Importing
Import complete
Import failed
```

Use inline errors where appropriate.

Do not use generic loading state for every operation.

---

# 32. Reuse Requirements

Inspect `Namespace/` before implementing:

```text
participant table
participant forms
modals
import UI
event detail participant section
CSS classes
empty states
```

Reuse/adapt useful UI pieces.

Do not copy old API/business logic if it conflicts with the rewrite architecture.

---

# 33. Out of Scope

Do not implement in Sprint 03:

- certificate generation
- certificate jobs
- bulk send execution
- delivery workers
- email sending
- provider fallback
- QR generation
- verification page
- analytics dashboard
- background import queues
- complex custom participant fields
- arbitrary spreadsheet schema storage
- permanent CSV/XLSX storage

---

# 34. Sprint-End Validation

Do not run the full project test/build cycle after every participant feature.

At sprint completion run:

- TypeScript checks
- linting
- production build
- Vercel-compatible build
- relevant database checks
- authorization checks
- manual participant creation
- duplicate participant rejection
- participant editing
- email-conflict handling
- participant deletion
- search
- pagination
- eligibility filtering
- CSV parsing
- XLSX parsing
- fuzzy/alias column recognition
- missing required column handling
- attendance parsing
- import preview
- duplicate-in-file handling
- duplicate-in-event handling
- batch persistence
- large sample import
- event participant counts

Fix sprint-related failures before completion.

---

# 35. Sprint-End Manual Flow

Verify:

```text
Open ACTIVE event
    ↓
Open Participants
    ↓
Add participant manually
    ↓
Edit participant
    ↓
Change eligibility
    ↓
Search participant
    ↓
Remove participant
    ↓
Upload CSV
    ↓
Browser parses file
    ↓
Columns normalized
    ↓
Rows validated
    ↓
Preview appears
    ↓
Duplicates/errors visible
    ↓
Confirm import
    ↓
Valid rows sent in batch
    ↓
Backend validates again
    ↓
Participants persisted
    ↓
Counts update
```

Repeat with XLSX.

Also verify a user from another organization cannot read or mutate the participants.

---

# 36. `current.md` Updates

Examples of meaningful Sprint 03 updates:

```text
- Participant CRUD implemented.
- Participant uniqueness enforced by event/email.
- Added server-side search and pagination.
- CSV/XLSX parsing runs in browser.
- Added lightweight alias-based column recognition.
- Attendance column maps to certificate eligibility.
- Import preview identifies invalid and duplicate rows.
- Confirmed imports persist in backend batches.
- Raw spreadsheet files are not stored.
- Sprint 03 Vercel production build passes.
```

Do not duplicate this whole document into `current.md`.

---

# 37. Completion Condition

Sprint 03 is complete when an authorized organization member can:

```text
Open event
    ↓
View participants
    ↓
Add / edit / remove participants
    ↓
Search and paginate participants
    ↓
Upload CSV or XLSX
    ↓
Parse entirely in browser
    ↓
Recognize reasonable header variations
    ↓
Validate name/email/eligibility
    ↓
Preview valid/invalid/duplicate rows
    ↓
Confirm
    ↓
Persist valid participants in batches
```

The resulting participant data must be clean enough that the next sprint can safely use:

```text
eligibleForCertificate = true
```

as the source set for certificate-generation jobs.
