# CVhelp Decisions

This file records architectural and product decisions so the app does not drift while implementation proceeds.

## Decided

### App Direction

Decision:

CVhelp will be a private, signed-in AI workspace for building a reusable career profile and managing separate job applications.

Reasoning:

The current code already has auth, profile bank, application records, and scoped chats. Continuing in that direction is lower risk than rebuilding around a different concept.

### Deployment Target

Decision:

The web app remains a Vercel-targeted Next.js app.

Reasoning:

The app is already linked to a Vercel project and builds successfully with Next.js.

### Database

Decision:

Use Postgres through Prisma for durable user, auth, profile, application, chat, and billing state.

Reasoning:

The schema already exists and migrations are current. Postgres is appropriate for user-owned durable workspace data.

### Profile Memory

Decision:

The profile builder owns global reusable career memory.

Reasoning:

Facts like education, projects, experience, links, skills, achievements, and evidence should be reusable across many applications.

### Application Memory

Decision:

Each application owns its own memory, notes, selected evidence, drafts, and artifacts.

Reasoning:

Application-specific positioning should not pollute the user's global profile. This matches the existing ProofCV application-folder pattern.

### ProofCV Compatibility

Decision:

CVhelp application data should be able to export a ProofCV-compatible `cv_data` shape.

Reasoning:

`proofcv/applications/*/cv_data.json` is already a useful working format. The web app should preserve that value while becoming database-backed.

### Chat Scoping

Decision:

Profile-builder chat and application chats must be separate memory scopes.

Reasoning:

The user needs different chats for each application. A chat for one role should not leak notes or drafts into another role.

### Three-Agent Chat Model

Decision:

CVhelp will use three production chat agents: Profile Agent, Application Agent, and General Agent.

Reasoning:

The current system already has profile and application modes, but the AI logic is concentrated in `/api/chat`. Formal agent definitions make behavior easier to test and keep memory boundaries clear. The Profile Agent owns reusable career memory, the Application Agent owns one isolated application workspace, and the General Agent owns cross-application routing and platform-level tasks.

### General Chat as Intake and Router

Decision:

General Chat will become the primary surface for creating new applications from job descriptions or job URLs.

Reasoning:

Users naturally paste job descriptions into chat. Keeping application creation in General Chat lets the app understand intent, create the job/application record through deterministic backend code, and then offer a clear button to open the newly created application chat. The Applications sidebar should become navigation, search, status, and archive management rather than the primary creation form.

### Deterministic Backend Actions

Decision:

Agents may propose actions, but backend code must validate and execute all state-changing operations.

Reasoning:

Application creation, archive/delete/status updates, profile handoffs, and other platform actions require ownership checks, schema validation, billing/rate gates, and predictable storage behavior. The model must not directly manipulate database state.

### Profile Handoffs from General Chat

Decision:

When profile-related facts or preferences come up in General Chat, the app will create an explicit handoff to Profile Chat rather than silently updating the profile bank.

Reasoning:

Reusable profile memory has higher trust requirements than general discussion. A visible handoff note gives the user and Profile Agent enough context to confirm and save supported facts without polluting the profile with ambiguous comments.

### Application Chat Threads

Decision:

Each application will use one default chat thread unless a clearly justified task-specific thread is added later.

Reasoning:

The schema already supports `threadKey`, but one application chat keeps the workflow understandable and preserves the current UI. Memory and artifacts remain structured behind the thread.

### Profile Editing

Decision:

Profile building remains primarily chat-command based, with a structured side-panel editor for direct user edits.

Reasoning:

Chat is the easiest input path for most users, but users still need a manual way to correct and maintain their own profile facts without negotiating every change through the agent.

### Production Auth Environment

Decision:

Email/password auth requires `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEXTAUTH_URL`, and `NEXTAUTH_SECRET` in production. OAuth providers stay disabled unless their complete provider env var pairs are configured.

Reasoning:

Email/password is the primary auth path. Keeping OAuth optional reduces production auth risk while the core product is still moving. `NEXTAUTH_URL` must be the production origin and `NEXTAUTH_SECRET` must be a production-only random secret.

### AI Grounding

Decision:

Agents must not invent credentials, dates, employers, metrics, links, project facts, or submitted status.

Reasoning:

The product is only useful if it preserves truth. Saved sources and provenance should guide generation.

### Payments

Decision:

Add billing route boundaries before finalizing pricing.

Reasoning:

Stripe integration and pricing can be decided later, but route structure and feature gates should be planned now so the app can evolve cleanly.

Current Stripe environment placeholders:

- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_ID`
- `STRIPE_WEBHOOK_SECRET`

These are intentionally not required for local development yet. Billing routes return clear setup errors until Stripe products, prices, webhook handling, and pricing strategy are finalized.

### Testing

Decision:

Every major phase must include tests, with end-to-end coverage for auth, profile building, applications, chat isolation, generation, and billing route behavior.

Reasoning:

The app manages private user data and AI-generated career artifacts. Regressions in scoping or memory would be high impact.

## Open Decisions

### Pricing Strategy

Open:

- Free tier limits.
- Paid tier price.
- Whether to charge monthly, per generation, or both.
- Whether exports are paid-only.
- Whether profile builder is free.

Default for now:

Build route and feature-gate scaffolding, but do not hardcode final Stripe products or prices.

### OAuth Scope

Decision:

The initial production path will use email/password auth only.

Reasoning:

Google, GitHub, and LinkedIn can be added later. Keeping the initial production path to email/password reduces auth surface area while the core profile/application workflow is still being built.

### PDF Rendering Strategy

Decision:

Use TeX export first. Keep PDF rendering out of the request path until the renderer has a production-safe execution path.

Reasoning:

Generated artifacts need a portable export format immediately, but PDF rendering can be fragile in serverless runtimes and may require a worker or separate renderer. The app now exports `.tex` from saved artifacts; PDF generation can later reuse `proofcv/services/pdf-renderer`, a background job, or a dedicated rendering service once deployment constraints are clear.

### Memory Storage Shape

Open:

- Keep JSON columns only.
- Add normalized tables for sources, facts, artifacts, and versions.
- Hybrid approach.

Default for now:

Use a hybrid approach: stable JSON shapes for flexible AI memory, with normalized rows for records that need listing, ownership checks, and versioning.

### Background Jobs

Open:

- Whether profile updates, application analysis, and generation happen inline or through jobs.

Default for now:

Keep current actions inline with good error handling. Move long-running generation/export to background processing if latency becomes a problem.

### File Storage

Open:

- Store extracted text only in Postgres.
- Store original uploads in object storage.
- Store only metadata for binary files.

Default for now:

Continue storing extracted text and metadata first. Add object storage when original file download/reprocessing becomes required.

## Risks

- Current local env files contain secret-looking values. Rotate them if they have been exposed.
- The current `Conversation` uniqueness constraint may block multiple chats per application/mode.
- AI memory updates can corrupt useful profile data if schemas and validation are weak.
- URL job scraping may fail for dynamic or protected job boards.
- PDF generation may be difficult inside Vercel serverless constraints.
- Payment implementation should not be mixed into core application logic.
