# NameFrame Agent Instructions

## 1. Project Purpose

NameFrame is being rewritten from the ground up.

The previous implementation works, but much of it was built rapidly without sufficiently strong guarantees around:

- architecture
- reliability
- scalability
- maintainability
- extensibility
- error handling
- security
- data integrity
- observability

The purpose of this rewrite is not merely to reproduce the existing application.

The goal is to rebuild NameFrame with a clean, understandable architecture that can be extended and maintained without accumulating unnecessary complexity.

Prefer simple, reliable implementations over clever abstractions.

---

## 2. Core Product

NameFrame allows organizations to:

- create and manage events
- manage participants
- upload and configure certificate templates
- send certificates individually or in bulk
- generate certificates asynchronously
- deliver certificates through configurable email providers
- retry failed operations
- verify issued certificates publicly
- monitor event and certificate activity

The rewrite follows the specifications defined inside the `sprints/` directory.

---

## 3. Repository Navigation

Before implementing anything, inspect:

```text
AGENTS.md
sprints/
Namespace/
```

### `sprints/`

The `sprints/` directory contains the implementation plan.

Individual sprint files are permanent specifications.

Example:

```text
sprints/
├── current.md
├── sprint-01.md
├── sprint-02.md
├── sprint-03.md
└── ...
```

### `current.md`

`current.md` is the authoritative pointer to the active sprint.

Always read it first.

It should contain enough information to determine:

- which sprint is active
- what has already been implemented
- important decisions or assumptions made during implementation
- relevant implementation notes
- blockers, if any
- the next logical implementation area

Do not duplicate the entire sprint specification inside `current.md`.

The corresponding sprint document remains the source of truth for the complete sprint scope.

Example:

```text
current.md
    ↓
Sprint 3 active
    ↓
Read sprint-03.md
    ↓
Continue implementation
```

---

## 4. Sprint Progression

Sprint files are executed sequentially unless explicitly instructed otherwise.

Example:

```text
Sprint 1
↓
Sprint 2
↓
Sprint 3
↓
Sprint 4
```

Do not begin future sprint work early unless the current sprint requires foundational work that directly enables it.

When a sprint is completed:

1. verify the entire sprint scope
2. run sprint-level testing
3. resolve failures related to the sprint
4. update `current.md`
5. advance `current.md` to the next sprint

Do not delete or rewrite completed sprint specification files.

They remain as permanent implementation history and reference material.

---

## 5. Implementation Workflow

For each active sprint:

1. Read `current.md`.
2. Read the complete active sprint specification.
3. Inspect the existing implementation.
4. Inspect relevant reusable UI from `Namespace/`.
5. Identify dependencies and affected modules.
6. Implement the sprint incrementally in logical batches.
7. Continuously update `current.md` with meaningful progress and decisions.
8. Complete the entire sprint scope.
9. Run sprint-level testing.
10. Fix issues caused by the sprint.
11. Record useful future improvements.
12. Advance `current.md` only when the sprint is complete.

Implementation may naturally span multiple messages or working sessions.

Prefer batches that represent coherent pieces of functionality rather than arbitrary file counts.

---

## 6. Scope Discipline

Stay within the active sprint.

Do not perform unrelated refactors simply because nearby code looks bad.

If unrelated problems are discovered:

- record them as future improvements if useful
- leave them unchanged

An out-of-scope change is allowed only when it is necessary for the active sprint to work correctly.

Do not implement future sprint functionality unless required by the current sprint.

---

## 7. Clarification Rules

Ask questions when an important product or architectural decision is genuinely ambiguous and different choices would materially affect the implementation.

Do not ask unnecessary questions about implementation details that can be safely inferred.

### `JUST_DO_IT`

If the user's instruction contains:

```text
JUST_DO_IT
```

do not ask clarifying questions.

Instead:

- inspect the available context
- make the safest reasonable assumptions
- prefer existing project conventions
- document important assumptions in `current.md`
- continue the implementation

Do not use `JUST_DO_IT` as permission to expand scope.

---

## 8. Code Style

Code should be intentionally simple.

Prefer:

- straightforward control flow
- small focused functions
- realistic variable names
- explicit behavior
- reusable utilities
- readable modules

Avoid:

- unnecessary abstraction
- deeply nested logic
- premature generic systems
- excessive wrappers
- meaningless helper functions
- overly clever code
- duplicated implementations

A developer unfamiliar with the implementation should be able to understand the main flow without reverse-engineering it.

---

## 9. DRY Principle

Follow DRY wherever reuse improves clarity.

Before creating something new, inspect whether an equivalent implementation already exists.

Reuse existing:

- CSS classes
- IDs
- components
- layout structures
- utilities
- constants
- types
- validation logic

Do not create slightly different duplicates of existing functionality without a reason.

However, do not force reuse when doing so would create confusing coupling.

Clarity is more important than eliminating every repeated line.

---

## 10. CSS Rules

Use regular CSS.

Do not introduce Tailwind CSS for new implementation.

Prefer existing styles whenever possible.

Before creating a new selector:

1. inspect existing CSS
2. check whether an appropriate class or ID already exists
3. reuse it when semantically correct

Avoid duplicate classes that differ only trivially.

Keep styling:

- reusable
- predictable
- locally understandable
- responsive where required

Do not use large amounts of inline styling unless dynamically calculated values make it necessary.

---

## 11. Namespace Reference

The previous NameFrame implementation exists one directory level back inside:

```text
Namespace/
```

Treat `Namespace/` as a reference implementation.

Its primary purpose during the rewrite is to preserve useful:

- UI
- layouts
- components
- visual patterns
- user flows
- assets
- CSS
- interaction patterns

Before rebuilding an existing UI component, inspect `Namespace/`.

Prefer:

```text
reuse
↓
adapt
↓
rewrite only when necessary
```

Do not rebuild existing UI from scratch merely because this is a rewrite.

---

## 12. What NOT to Reuse From Namespace

Do not automatically copy old:

- API routes
- backend architecture
- database logic
- queue implementation
- worker implementation
- library utilities
- security logic
- authentication assumptions
- error handling patterns

The backend and infrastructure are being deliberately redesigned.

Old backend code may be inspected to understand product behavior, but new implementations should follow the current sprint specifications and rewrite architecture.

---

## 13. Components

Before creating a new component:

1. search the current rewrite
2. inspect `Namespace/`
3. determine whether an existing component can be reused or adapted

Create a new component only when existing implementations do not reasonably fit.

Do not create large monolithic components.

Do not fragment simple UI into dozens of unnecessary components either.

Component boundaries should follow meaningful UI or behavioral responsibilities.

---

## 14. Dependencies

Avoid introducing new packages.

Before adding a dependency, check whether the functionality can reasonably be implemented using:

- the existing dependency set
- platform APIs
- framework APIs
- small internal utilities

A new dependency is acceptable only when it provides meaningful value and avoids an inferior custom implementation.

Any meaningful dependency addition should be documented in `current.md` with its purpose.

---

## 15. Error Handling

Do not silently swallow errors.

Errors should be:

- classified where appropriate
- logged with useful context
- returned using appropriate status codes
- exposed safely to users
- handled without leaking sensitive internals

Avoid generic catch blocks that convert every problem into the same response.

Do not expose:

- stack traces
- credentials
- provider secrets
- internal database details
- sensitive participant information

---

## 16. Security

Treat security as part of implementation, not a later patch.

Always consider:

- authentication
- authorization
- organization isolation
- input validation
- file validation
- secret handling
- credential encryption
- sensitive logging
- public API exposure

Never trust resource IDs supplied by clients without verifying organization ownership and user permissions.

Never store secrets directly in source code.

---

## 17. Data Access

Keep organization boundaries explicit.

Every organization-owned resource must be accessed through validated organization membership.

Do not assume that possessing an event ID, participant ID, template ID, or job ID grants permission to access it.

Prefer clear data access patterns rather than scattering raw database queries throughout unrelated code.

---

## 18. Asynchronous Work

Certificate generation and email delivery are asynchronous workflows.

Do not convert them into long-running HTTP requests merely because that is easier to implement.

Work should be represented durably before background processing begins.

Background jobs must be designed so they can eventually support:

- retries
- failure inspection
- multiple workers
- crash recovery
- independent processing
- idempotency

Exact behavior is defined by the relevant sprint specification.

---

## 19. Worker Rules

Workers should:

- claim only work they are allowed to process
- avoid processing the same job concurrently
- update job state consistently
- preserve failure information
- distinguish temporary and permanent failures where possible
- avoid losing work after crashes
- make retry behavior explicit
- remain safe when an operation is attempted more than once

Do not rely on process memory as the sole source of job state.

---

## 20. Database Changes

Database changes must follow the active sprint specification.

Prefer:

- explicit relations
- meaningful constraints
- appropriate unique constraints
- indexes supporting real queries
- safe migrations

Do not add fields because they "might be useful someday."

Do not remove or rename persisted fields casually once active features depend on them.

---

## 21. API Design

Keep APIs predictable.

Use appropriate HTTP semantics:

```text
GET     read
POST    create/action
PATCH   partial update
DELETE  delete
```

Routes should:

- validate input
- authenticate the user
- authorize resource access
- call application/domain logic
- return consistent responses

Avoid putting large amounts of business logic directly inside route handlers.

---

## 22. Testing Policy

Do not run the complete test/build cycle after every small feature or file change.

Testing happens primarily at the end of the active sprint.

During implementation, targeted checks may be used when needed to debug uncertain behavior.

At sprint completion, the implementation must pass the checks required for Vercel deployment, including applicable:

- production build
- TypeScript validation
- linting
- relevant automated tests
- critical integration tests
- essential manual smoke checks

Do not mark a sprint complete while relevant build or test failures remain.

If an unrelated pre-existing failure prevents validation, document it clearly in `current.md`.

---

## 23. Sprint Completion Review

At the end of every sprint:

- verify every requirement in the sprint document
- run sprint-level tests
- fix regressions introduced by the sprint
- inspect obvious security issues
- inspect obvious error-handling gaps
- remove temporary debugging code
- update `current.md`

Also record a short list of reasonable future improvements discovered during implementation.

Do not implement those improvements immediately unless they belong to the current sprint.

---

## 24. Current State Updates

Update `current.md` whenever meaningful implementation progress occurs.

Keep updates concise.

Useful entries include:

```text
- Added organization membership authorization.
- Reused Namespace event-card UI.
- Chose X because Y.
- Added migration for organization membership.
- Event creation API implemented.
- Build passes.
```

Do not turn `current.md` into a minute-by-minute activity log.

Its purpose is to allow another agent to immediately understand the implementation state and continue correctly.

---

## 25. Handoff Between Agents

Assume another agent may continue the project at any point.

Therefore:

- code should not depend on undocumented assumptions
- meaningful architectural decisions belong in project documentation or `current.md`
- incomplete work must be identifiable
- temporary hacks must be explicitly marked
- sprint progress must remain accurate

An agent starting fresh should be able to read:

```text
AGENTS.md
↓
sprints/current.md
↓
active sprint specification
↓
relevant implementation
```

and continue without needing the previous agent's conversation history.

---

## 26. Primary Engineering Principles

When making implementation decisions, prioritize roughly in this order:

1. Correctness
2. Reliability
3. Data integrity
4. Security
5. Simplicity
6. Maintainability
7. Extensibility
8. Performance
9. Scalability
10. Cost optimization

Do not sacrifice correctness or clarity for theoretical scale that NameFrame does not currently require.

The expected scale is approximately:

```text
~50,000 certificates/month
```

The architecture should support growth beyond this without requiring an immediate rewrite, but it does not need infrastructure designed for millions of jobs per second.

---

## 27. Final Rule

Implement the active sprint completely, but nothing unnecessarily beyond it.

Reuse what is good.

Replace what is structurally bad.

Keep the architecture understandable.

When uncertain, prefer the smallest design that correctly preserves the guarantees required by the system.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
