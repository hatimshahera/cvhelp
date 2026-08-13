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

### Application Chat Threads

Decision:

Each application will use one chat thread for the MVP.

Reasoning:

Multiple threads for CV tailoring, cover letters, interview prep, and application questions could add avoidable complexity. One thread keeps the product easier to understand while memory and artifacts remain structured behind it.

### Profile Editing

Decision:

Profile building remains primarily chat-command based, with a structured side-panel editor for direct user edits.

Reasoning:

Chat is the easiest input path for most users, but users still need a manual way to correct and maintain their own profile facts without negotiating every change through the agent.

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

These are intentionally not required for local MVP use yet. Billing routes return clear setup errors until Stripe products, prices, webhook handling, and pricing strategy are finalized.

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

The MVP will use email/password auth only.

Reasoning:

Google, GitHub, and LinkedIn can be added later. Keeping the MVP to email/password reduces auth surface area while the core profile/application workflow is still being built.

### PDF Rendering Strategy

Decision:

Use TeX export first. Keep PDF rendering out of the request path for MVP.

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

Keep MVP actions inline with good error handling. Move long-running generation/export to background processing if latency becomes a problem.

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
