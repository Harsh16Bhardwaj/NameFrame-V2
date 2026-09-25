# Sprint 02 — Organization Setup, Event Creation & Certificate Template Editor

## Objective

Implement the complete organization setup and event creation experience on top of Sprint 01.

This sprint should deliver:

- organization creation workflow
- organization-aware event creation
- resumable `DRAFT` events
- event editing
- event completion
- leader-only event deletion
- Cloudinary-backed certificate background upload
- certificate template creation
- draggable/resizable name placement editor
- basic name styling controls
- template editing
- clear validation and error propagation
- event/template UI based heavily on the previous `Namespace/` implementation
- sprint-end Vercel production validation

Do not implement participant management, bulk sending, certificate generation workers, or actual email delivery in this sprint.

---

# 1. Important Implementation Principle

Reuse the previous NameFrame implementation aggressively for:

- event creation UI
- certificate template editor
- image preview/editor layout
- drag/resize behavior
- CSS
- component structure
- interaction patterns

Refer to:

```text
Namespace/
```

before implementing the screen.

Do not reuse old API routes, database logic, queue logic, or backend architecture.

The new implementation must use the architecture created in Sprint 01.

---

# 2. Organization Setup Workflow

A user may belong to only one organization.

If an authenticated user has no organization, they should be directed to organization setup before they can create or manage events.

## Organization Creation Screen

Suggested route:

```text
/organization/setup
```

Required fields:

```text
organizationName
organizationLogo
```

The organization name is required.

The organization logo should be uploaded and persisted.

On successful organization creation:

```text
Authenticated User
        ↓
Create Organization
        ↓
Create OrganizationMember
        ↓
Assign GROUP_LEADER
        ↓
Associate User with Organization
        ↓
Redirect to event/dashboard area
```

The creator automatically becomes the sole `GROUP_LEADER`.

Do not allow a second organization to be created by the same user.

If the user already belongs to an organization, organization setup should not create another organization.

---

# 3. Organization Data in Events

Event creation must not ask the user to manually re-enter organization identity.

Automatically derive:

```text
organizationName
organizationLogo
```

from the authenticated user's organization.

The user must not be able to attach an event to another organization by submitting a different organization ID.

Organization ownership must be derived server-side from authenticated membership.

Event-level organization name/logo may be persisted as snapshot fields if required by the Sprint 01 schema, but their initial values come from the organization.

---

# 4. Event Creation UX

The event creation experience should be a single cohesive screen.

Suggested route:

```text
/events/new
```

The page should visually separate:

1. event information
2. certificate template setup

The template area should look like a distinct inner section/card so the user understands that it is a separate configuration step.

Suggested high-level layout:

```text
┌─────────────────────────────────────────────────────┐
│ Create Event                                        │
│                                                     │
│ Event Details                                       │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Event Name                                      │ │
│ │ Description                                     │ │
│ │ Location                                        │ │
│ │ Event Date                                      │ │
│ │ Certificate Title                               │ │
│ │ Email Subject                                   │ │
│ │ Email Body                                      │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ Certificate Template                               │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Step 1: Upload certificate background           │ │
│ │                                                 │ │
│ │          [ Upload Certificate Image ]           │ │
│ │                                                 │ │
│ │ Step 2: Position participant name               │ │
│ │                                                 │ │
│ │   ┌─────────────────────────────────────────┐   │ │
│ │   │         Uploaded certificate            │   │ │
│ │   │                                         │   │ │
│ │   │        ┌───────────────────┐            │   │ │
│ │   │        │ Participant Name  │            │   │ │
│ │   │        └───────────────────┘            │   │ │
│ │   │                                         │   │ │
│ │   └─────────────────────────────────────────┘   │ │
│ │                                                 │ │
│ │ Font size / color / weight / alignment          │ │
│ │                                                 │ │
│ │               [ Create Template ]               │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│                      [ Create Event ]               │
└─────────────────────────────────────────────────────┘
```

Do not create a separate preview screen.

The editor itself is the preview.

---

# 5. Internal Draft Event Flow

To support:

- template creation before final event creation
- resumable abandoned forms
- template ownership without orphan records

use a single internal `DRAFT` event shell.

## Flow

When the user begins creating an event:

```text
Open Create Event
        ↓
Create or load user's existing DRAFT event
        ↓
Populate form
        ↓
Upload/template configuration attaches to DRAFT event
        ↓
User completes form
        ↓
Finalize event
        ↓
DRAFT → ACTIVE
```

Do not create multiple draft events every time the user revisits the page.

If a resumable draft already exists for the user/organization, preload it.

The user should experience this as one creation flow even though the backend persists a draft early.

---

# 6. Event Status Behavior

Use the existing Sprint 01 enum:

```text
DRAFT
ACTIVE
COMPLETED
```

## DRAFT

A new event creation flow begins as `DRAFT`.

A draft may exist when:

- the user started event creation
- uploaded a template
- configured the template
- partially filled event information
- navigated away before final creation

Certificates cannot be sent from a draft event.

## ACTIVE

When the user clicks the final:

```text
Create Event
```

and all required validation succeeds:

```text
DRAFT → ACTIVE
```

No separate "Activate Event" UI is required.

## COMPLETED

Only `GROUP_LEADER` may mark an event completed.

`COMPLETED` is primarily an organizational/dashboard state.

A completed event does not permanently prevent later certificate sending.

If a future send occurs, do not automatically mutate state unless explicitly required by a later sprint.

---

# 7. Required Event Fields

At minimum require:

```text
title
eventDate
certificateTitle
emailSubject
emailBody
certificateTemplate
```

Automatically provide organization identity from the authenticated organization.

Optional fields:

```text
description
location
```

Organization name/logo should not be manually required in the event form because they already come from the organization.

Validation messages must identify the specific missing or invalid field.

Do not return a generic "Invalid event" response.

---

# 8. Event Editing

Both:

```text
GROUP_LEADER
GROUP_MEMBER
```

may edit an existing event.

Editable event fields include:

```text
title
description
location
eventDate
certificateTitle
emailSubject
emailBody
```

Template placement/style may also be edited.

All edits must enforce organization ownership.

---

# 9. Certificate Background Upload

The user selects a certificate image.

Supported initial formats:

```text
PNG
JPEG
JPG
```

Do not support PDF in Sprint 02.

Set a reasonable upload limit.

Recommended:

```text
10 MB maximum
```

Reject unsupported files before unnecessary Cloudinary work where possible.

---

# 10. Upload Flow

When the user selects an image:

```text
Select File
    ↓
Validate type/size
    ↓
Upload to Cloudinary
    ↓
Receive secure URL + asset metadata
    ↓
Show uploaded image inside editor
```

The image may be uploaded before the final event submission because the DRAFT event already exists.

Persist enough Cloudinary metadata to manage the asset safely later if needed.

Do not pass arbitrary client-provided URLs directly into the template record without validating the upload result.

---

# 11. Template Creation Flow

After the certificate background has been uploaded:

1. display the uploaded certificate image
2. show a default participant-name rectangle
3. allow the user to reposition it
4. allow resizing from its edges
5. capture the final bounding coordinates
6. allow basic text styling
7. user clicks `Create Template`
8. persist the template
9. associate the template with the DRAFT event
10. keep the template ID attached to the event creation state

The final event cannot become `ACTIVE` without a valid template.

---

# 12. Name Placement Editor

The previous NameFrame implementation already contains a useful editor.

Inspect and reuse/adapt its behavior.

The participant-name area must be represented by a visible rectangular bounding box.

The user can:

- drag the full rectangle to reposition it
- drag the left edge
- drag the right edge
- drag the top edge
- drag the bottom edge

The rectangle starts with sensible predetermined dimensions and placement.

Assume typical participant names fit inside the rectangle.

Do not implement arbitrary multi-field certificate editing in this sprint.

---

# 13. Coordinate Model

The editor may operate using rendered pixel positions for intuitive drag/resize behavior.

Persist normalized coordinates so rendering remains independent of preview size.

Persist:

```text
nameLeft
nameTop
nameRight
nameBottom
```

as normalized values relative to the original certificate dimensions.

Example:

```text
0.25
0.42
0.75
0.55
```

Conversion:

```text
normalizedX = displayedPixelX / displayedImageWidth
normalizedY = displayedPixelY / displayedImageHeight
```

When reopening the editor:

```text
displayedPixelX = normalizedX * displayedImageWidth
displayedPixelY = normalizedY * displayedImageHeight
```

Do not persist browser-preview pixel coordinates directly.

---

# 14. Template Styling

Keep styling basic.

Support:

```text
fontSize
fontColor
fontWeight
textAlign
```

If the old implementation already has a clean reusable font-family control, it may also be retained.

Avoid turning Sprint 02 into a full design tool.

Do not add:

- arbitrary text layers
- multiple placeholders
- rotation
- complex typography systems
- multiple template variants

unless the old implementation already provides them at effectively no architectural cost.

---

# 15. Template Background Immutability

Once a template has been created, its background image must not be mutable.

Users may edit:

```text
name coordinates
font size
font color
font weight
text alignment
```

They may not replace the background image in-place.

This prevents the identity of a template from silently changing.

---

# 16. Template Deletion

A template may be deleted.

After deletion:

```text
Event exists
Template missing
```

The event must not be allowed to send certificates.

Later send operations must fail clearly with a structured condition such as:

```text
TEMPLATE_REQUIRED
```

or:

```text
EVENT_TEMPLATE_MISSING
```

The UI should display a clear message telling the user to create a new template.

To use a different background image:

```text
delete existing template
        ↓
create a new template
```

Do not mutate the background of the existing template.

---

# 17. Template Editing Screen

The event detail page must allow opening the current template editor.

Reuse the same editor component from event creation.

Suggested route:

```text
/events/{eventId}/template
```

or an equivalent section/tab inside the event detail page.

The editor should:

- load current background
- show current bounding rectangle
- show current styles
- allow coordinate/style edits
- save without changing the background

Do not duplicate the editor implementation between create and edit flows.

---

# 18. Event Detail Screen

Reuse the previous NameFrame event UI where practical.

Sprint 02 should provide enough structure for future participant management.

Suggested event detail areas:

```text
Overview
Certificate Template
Email Configuration
Event Settings
```

Participant management will be added in Sprint 03.

Avoid implementing fake participant functionality in this sprint.

---

# 19. Event List Screen

Create/reuse the event listing page.

Each event item/card should show:

```text
title
eventDate
location if available
status
template thumbnail if available
```

Future participant counts may be added later.

Draft events should be visibly distinguishable from active events.

The user's resumable creation draft may be surfaced separately or through the create-event flow.

---

# 20. Event Deletion

Only `GROUP_LEADER` may delete an event.

The UI must require typed confirmation.

Example:

```text
Type DELETE to confirm
```

Do not delete immediately from a single accidental click.

Backend deletion remains soft deletion according to Sprint 01.

Deleting the event must not destroy verification-safe issued certificate records.

---

# 21. Organization Authorization

Every event/template route must validate:

```text
authenticated user
        ↓
organization membership
        ↓
resource belongs to same organization
        ↓
role permission
```

Do not trust:

```text
organizationId
eventId
templateId
```

provided by the client without server-side verification.

Leader-only operations:

```text
create event
delete event
mark completed
```

Member-allowed operations:

```text
view event
edit event
edit template
manage email configuration
```

---

# 22. Recommended API Surface

The exact file structure may follow current Next.js conventions, but behavior should roughly support:

## Organization

```text
POST   /api/organizations
GET    /api/organization
```

## Events

```text
POST   /api/events
GET    /api/events
GET    /api/events/:eventId
PATCH  /api/events/:eventId
DELETE /api/events/:eventId
```

## Event State

```text
POST   /api/events/:eventId/complete
POST   /api/events/:eventId/finalize
```

`finalize` converts the valid DRAFT event into ACTIVE.

Do not expose arbitrary status updates if role/business rules can be represented as explicit actions.

## Templates

```text
POST   /api/events/:eventId/template
GET    /api/events/:eventId/template
PATCH  /api/events/:eventId/template
DELETE /api/events/:eventId/template
```

## Upload

Use a dedicated Cloudinary upload/signature endpoint or equivalent secure upload flow.

Do not embed raw image handling inside the general event mutation route.

---

# 23. Draft Event API Behavior

`POST /api/events` may create the initial draft shell.

The server should derive organization/user identity from authentication.

Do not accept client-controlled ownership.

When the create-event page loads:

```text
look for resumable DRAFT belonging to user/organization
```

If appropriate:

```text
reuse existing draft
```

instead of creating another one.

Final submission must validate:

```text
required event fields
valid organization
valid attached template
template has uploaded background
template has valid name bounds
```

Only then:

```text
DRAFT → ACTIVE
```

---

# 24. Error Handling

Use Sprint 01 error conventions.

Add/handle domain-specific errors such as:

```text
ORGANIZATION_REQUIRED
ORGANIZATION_ALREADY_EXISTS

EVENT_NOT_FOUND
EVENT_NOT_EDITABLE
EVENT_NOT_DRAFT
EVENT_ALREADY_DELETED

TEMPLATE_REQUIRED
TEMPLATE_NOT_FOUND
TEMPLATE_BACKGROUND_IMMUTABLE
INVALID_TEMPLATE_COORDINATES

INVALID_UPLOAD_TYPE
UPLOAD_TOO_LARGE
UPLOAD_FAILED
```

Map them to suitable HTTP responses.

Examples:

```text
400 invalid configuration
401 unauthenticated
403 wrong role / wrong organization
404 missing event/template
409 organization already exists / conflicting event state
413 oversized upload if handled at request layer
500 unexpected internal error
```

Do not expose Cloudinary secrets or raw provider errors to the client.

---

# 25. Coordinate Validation

Before saving template coordinates, validate:

```text
0 <= left < right <= 1
0 <= top < bottom <= 1
```

Reject invalid or collapsed rectangles.

Do not trust browser-side drag constraints as the only validation.

---

# 26. Cloudinary Failure Behavior

If Cloudinary upload fails:

- do not create a usable template
- keep the DRAFT event intact
- return a structured upload error
- allow the user to retry
- do not activate the event

If template persistence fails after a successful upload, preserve enough asset metadata to support later cleanup if necessary.

Do not silently leave the UI believing the template exists.

---

# 27. UI State Handling

The create-event screen should visibly distinguish:

```text
Uploading
Upload failed
Image uploaded
Template not configured
Template configured
Saving template
Template saved
Saving event
Event created
```

Disable actions when prerequisite steps are incomplete.

Examples:

- `Create Template` disabled until image upload succeeds
- final `Create Event` disabled until template creation succeeds
- show field-specific event validation errors

Do not represent every failure as a generic toast.

Use inline errors where the error belongs to a specific step.

---

# 28. Draft Resume Behavior

If a user navigates away during event creation and returns later:

```text
load current DRAFT
```

Preload:

```text
event fields
uploaded template if created
template coordinates
template style
```

Do not create a second draft unnecessarily.

If no draft exists, start a fresh one.

---

# 29. Avoided Scope

Do not implement in Sprint 02:

- participant import
- participant CRUD
- certificate generation
- Cloudinary certificate rendering
- QR generation
- email workers
- delivery workers
- retry processing
- provider fallback
- verification page
- analytics dashboard
- rate limiting unless required by existing infrastructure

Rate limiting belongs to a later security/hardening sprint unless already available at effectively zero extra complexity.

---

# 30. Reuse Requirements

Before implementing each major UI area, inspect `Namespace/`.

Highest-priority reuse targets:

```text
event creation form
certificate editor
drag/resize rectangle
template styling controls
event cards
event detail layout
existing CSS classes
```

Reuse or adapt existing components when they fit.

Do not recreate visually equivalent components unnecessarily.

If a reused component contains old backend coupling, separate the UI from the old data logic rather than copying the old API assumptions.

---

# 31. Sprint-End Validation

Do not run the full validation suite after every small feature.

At sprint completion run:

- Prisma schema validation if schema changed
- relevant migrations if needed
- TypeScript checks
- linting
- production build
- Vercel-compatible build
- Clerk-authenticated organization flow
- leader/member authorization checks
- event draft creation
- draft resume
- final event activation
- event edit
- leader-only completion
- leader-only deletion
- Cloudinary image upload
- template creation
- coordinate persistence
- template editing
- template deletion
- attempt to activate/send-ready event without template must fail correctly

Fix sprint-related failures before marking complete.

---

# 32. Sprint-End Manual Flow

Verify this entire path manually:

```text
Sign in
  ↓
No organization
  ↓
Create organization
  ↓
Become GROUP_LEADER
  ↓
Open Create Event
  ↓
DRAFT event created/reused
  ↓
Fill event details
  ↓
Upload certificate background
  ↓
Cloudinary returns image
  ↓
Image appears in editor
  ↓
Move/resize name rectangle
  ↓
Set basic styling
  ↓
Create Template
  ↓
Template linked to draft
  ↓
Create Event
  ↓
Validation passes
  ↓
DRAFT → ACTIVE
  ↓
Redirect to event detail
  ↓
Edit event
  ↓
Edit template placement/style
  ↓
Delete template
  ↓
Event clearly reports missing template
  ↓
Create replacement template
  ↓
Leader marks event completed
```

Also verify a `GROUP_MEMBER` cannot:

```text
create event
delete event
mark event completed
manage organization membership
```

but can edit existing event/template configuration.

---

# 33. `current.md` Updates

Meaningful progress examples:

```text
- Organization setup screen and creation API implemented.
- Organization creator automatically becomes GROUP_LEADER.
- Resumable DRAFT event flow implemented.
- Reused Namespace certificate editor.
- Certificate background uploads to Cloudinary.
- Template name bounds stored as normalized coordinates.
- Template background made immutable after creation.
- Event finalization now transitions DRAFT → ACTIVE.
- Leader-only completion/deletion enforced.
- Sprint 02 Vercel production build passes.
```

Do not duplicate this specification into `current.md`.

---

# 34. Completion Condition

Sprint 02 is complete when NameFrame supports:

```text
Organization setup
        ↓
Organization-aware authenticated user
        ↓
Resumable event draft
        ↓
Event details
        ↓
Certificate image upload
        ↓
Interactive name-placement editor
        ↓
Template creation
        ↓
Template attached to draft
        ↓
Final Create Event
        ↓
ACTIVE event
        ↓
Event/template editing
        ↓
Leader-controlled completion/deletion
```

The resulting implementation should be clean enough that Sprint 03 can add participant management without changing the event/template architecture.
