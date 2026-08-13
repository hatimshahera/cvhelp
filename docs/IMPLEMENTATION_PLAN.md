# CVhelp Implementation Plan

This plan tracks the path from the current working MVP to a production-ready CVhelp app. The immediate goal is a usable signed-in workspace with a strong profile-builder chat, separate memory-backed chats for each job application, saved application artifacts similar to `proofcv/applications/*`, a polished UI, end-to-end tests, and payment route placeholders ready for Stripe.

## Current Baseline

- Next.js app with Auth.js, Prisma, Neon/Postgres, and OpenAI integration.
- Email/password signup and signin exist.
- Optional OAuth provider wiring exists for Google, GitHub, and LinkedIn.
- Protected `/app` workspace exists.
- Profile-builder chat exists and persists messages.
- Profile bank exists with `masterProfile`, `rawSources`, and `checklist`.
- File upload exists for text files and PDFs.
- Application records exist with `company`, `role`, `slug`, `status`, `jobPost`, `jobSummary`, `notes`, and `drafts`.
- Application-specific conversations exist, but the application memory/artifact model needs to be made explicit and richer.
- Production build and typecheck currently pass.

## Target Product Shape

CVhelp should become a private AI application workspace:

- Users sign in and build a reusable career profile bank.
- The profile builder asks focused questions and saves structured facts, evidence, preferences, sources, and open questions.
- Each job application has its own workspace, chat history, job post, fit analysis, selected evidence, drafts, notes, files, decisions, and final outputs.
- Application data should feel like the web version of `proofcv/applications/*`, but database-backed and editable.
- Chat memory must be durable, scoped, and auditable.
- The UI should make status, next steps, saved evidence, and outputs obvious without forcing the user to inspect raw chat.
- Payments should be added behind route boundaries so Stripe can be connected later without reshaping the app.
- Each phase must include tests and acceptance criteria.

## Phase 1: Documentation, Scope, and Tracking

Status: planned.

Work:

- Add planning docs.
- Define MVP, beta, and full-working scopes.
- Record current decisions and open decisions.
- Create acceptance criteria that can drive implementation and testing.

Deliverables:

- `docs/IMPLEMENTATION_PLAN.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/WHATS_DONE.md`
- `docs/DECISIONS.md`
- `docs/PHASE_CHECKLIST.md`

Tests:

- No runtime tests required for this documentation-only phase.
- Validate that the plan maps to current schema/API reality.

## Phase 2: Data Model and Application Memory

Status: planned.

Goal:

Make profile memory and application memory first-class instead of relying mostly on JSON blobs plus chat transcripts.

Work:

- Keep the current JSON columns where they are useful, but define stable shapes for each JSON field.
- Extend `Application` data to store the equivalent of ProofCV files:
  - candidate snapshot
  - target company and role
  - job post source and extracted text
  - fit tags
  - selected projects
  - selected research
  - selected experience
  - selected skills
  - profile summary for this role
  - honesty notes and risk notes
  - application notes
  - draft CV bullets
  - cover letter or recruiter note drafts
  - application Q&A drafts
  - generated/exported artifacts
  - status and next action
- Add an application memory update step after application chat turns.
- Add profile memory update rules after profile-builder chat turns.
- Add source provenance to saved facts so the app can explain where a claim came from.
- Add `Conversation` support for multiple chat threads per application if needed:
  - default application chat
  - CV tailoring chat
  - cover letter chat
  - interview prep chat
  - application questions chat
- Review the current `@@unique([applicationId, mode])` constraint because it currently allows only one conversation per application/mode.

Deliverables:

- Prisma migration for memory/artifact changes.
- Types/helpers for profile memory and application memory JSON.
- API update for profile memory write/read.
- API update for application memory write/read.
- Seed/import script or utility to map existing `proofcv/applications/*` data into the new database shape.

Tests:

- Unit tests for JSON shape validation.
- API tests for creating an application and saving memory.
- Regression test that one application chat cannot see another application's private memory.
- Migration test against a fresh database.

## Phase 3: Auth, Sessions, and Account Safety

Status: planned.

Goal:

Make signin/signup reliable enough for real users.

Work:

- Keep email/password auth working.
- Confirm production `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, database envs, and OAuth callback URLs.
- Add password reset route planning if email provider is added.
- Improve signup/signin validation and error states.
- Add account settings shell.
- Add route guards for all workspace, API, payment, and export routes.
- Decide whether OAuth is in MVP or after MVP.

Deliverables:

- Hardened auth pages and API behavior.
- Account settings page or modal.
- Environment checklist for Vercel.

Tests:

- Signup creates a user and signs in.
- Duplicate signup is rejected.
- Invalid credentials are rejected.
- Signed-out users cannot access `/app` or private APIs.
- Signed-in users cannot access another user's applications, conversations, files, or generated artifacts.

## Phase 4: Profile Builder Chat System

Status: planned.

Goal:

Make the profile builder a guided AI intake system, not just a general chat box.

Work:

- Define a profile schema with sections:
  - identity and contact
  - links
  - education
  - experience
  - projects
  - research
  - skills
  - achievements
  - preferences
  - constraints
  - evidence
  - open questions
- Add guided intake states:
  - initial CV upload or paste
  - LinkedIn/GitHub/project import
  - experience confirmation
  - evidence and metrics collection
  - role preferences
  - final review
- Make the agent ask one useful question at a time when profile gaps remain.
- Add source cards and editable profile facts in the UI.
- Add correction/delete flow for facts.
- Add profile completeness scoring based on saved evidence, not just message count.

Deliverables:

- Profile builder chat instructions.
- Profile memory update function.
- Profile review UI.
- Source/fact editing UI.
- Profile completeness panel.

Tests:

- Uploading a CV stores a raw source and updates checklist.
- Chat-provided facts are extracted into the profile bank.
- Corrections replace facts instead of duplicating them.
- Delete requests remove or mark facts as excluded.
- The profile agent does not invent dates, employers, metrics, credentials, or links.

## Phase 5: Application Workspace System

Status: planned.

Goal:

Each application should behave like its own project folder from `proofcv`, but in the app.

Work:

- Improve application creation from pasted descriptions and URLs.
- Save job post content, source URL, captured date, and extracted text.
- Add application overview panel:
  - company
  - role
  - status
  - next action
  - fit score or fit summary
  - risks/gaps
  - selected evidence
  - draft outputs
- Add per-application memory:
  - job requirements
  - responsibilities
  - keywords
  - must-have skills
  - nice-to-have skills
  - matched evidence
  - gaps
  - honesty notes
  - selected projects/research/experience
  - generated CV data
- Add separate chats for each application workspace.
- Add status transitions:
  - draft
  - researching
  - tailoring CV
  - cover note ready
  - submitted
  - interviewing
  - rejected
  - archived
- Add application deletion/archive behavior.

Deliverables:

- Application detail route or rich in-app detail state.
- Application memory panel.
- Application chat memory updater.
- Application status controls.
- Import/export shape compatible with `proofcv` data.

Tests:

- Creating an application saves the job post and creates a scoped chat.
- Switching applications loads the correct chat and memory.
- Application A chat cannot read Application B memory.
- Job post updates preserve previous notes and drafts.
- Application status changes persist.

## Phase 6: Generation and Outputs

Status: planned.

Goal:

Turn saved profile and application memory into concrete artifacts.

Work:

- Generate role-specific CV data from profile bank plus application memory.
- Generate CV bullets with source-backed claims.
- Generate cover notes, recruiter emails, and application answers.
- Add an output review screen before export.
- Add regenerate/refine flows.
- Add PDF/TeX rendering strategy:
  - either integrate existing `proofcv/services/pdf-renderer`
  - or add a Vercel-compatible rendering path
  - or keep TeX/PDF generation as a background/export service
- Store generated artifacts with version history.
- Add artifact status:
  - draft
  - reviewed
  - exported
  - submitted

Deliverables:

- `/api/applications/[id]/generate`
- `/api/applications/[id]/artifacts`
- Artifact review UI.
- Export/download flow.
- ProofCV-compatible `cv_data` export.

Tests:

- Generated output uses only saved profile/application evidence.
- Regeneration creates a new version instead of overwriting history silently.
- Exports are scoped to the signed-in user.
- PDF generation failure returns a useful error without losing drafts.

## Phase 7: Payments and Subscription Routes

Status: planned.

Goal:

Add payment boundaries now so Stripe can be connected after pricing is decided.

Work:

- Add payment route placeholders:
  - `POST /api/billing/checkout`
  - `POST /api/billing/portal`
  - `POST /api/billing/webhook`
  - `GET /api/billing/status`
- Add subscription fields or related model:
  - provider
  - providerCustomerId
  - providerSubscriptionId
  - plan
  - status
  - currentPeriodEnd
  - trialEndsAt
- Add feature gating helper:
  - free profile builder limits
  - application count limits
  - generation/export limits
  - paid unlimited or higher limits
- Keep pricing strategy undecided for now.
- Avoid hardcoding product IDs until Stripe products are created.

Deliverables:

- Billing schema.
- Billing API route skeletons.
- Billing status UI placeholder.
- Feature gate helper.
- Stripe integration notes in docs.

Tests:

- Signed-out users cannot call billing routes.
- Billing status returns a predictable free/default state.
- Feature gates block over-limit actions with clear messages.
- Webhook route validates signatures once Stripe is connected.

## Phase 8: UI Polish and Product Flow

Status: planned.

Goal:

Make the app feel like a serious workspace rather than a single chat page.

Work:

- Redesign workspace layout around:
  - left navigation
  - application list
  - profile bank status
  - main chat/detail panel
  - right-side memory/output panel where useful
- Add clear empty states.
- Add loading, saving, error, and success states.
- Add mobile layout.
- Add profile review and application overview screens.
- Add artifact cards for CV, cover note, recruiter message, and Q&A.
- Add status badges and progress indicators.
- Improve message rendering for structured outputs.

Deliverables:

- Polished authenticated workspace.
- Responsive application/profile screens.
- Stable component structure.
- Accessible controls and keyboard-friendly flows.

Tests:

- Browser tests for desktop and mobile.
- No overlapping text or broken layout at common viewport sizes.
- Core flows are usable without console errors.
- Loading/error/empty states render correctly.

## Phase 9: End-to-End Tests and Quality Gates

Status: planned.

Goal:

Make every core feature testable before deployment.

Work:

- Add a test runner and browser test setup.
- Add mocked OpenAI responses for deterministic tests.
- Add test database setup.
- Add fixtures for CV text, job post text, and application data.
- Add CI or local quality script.

Required end-to-end tests:

- User signs up, signs in, and reaches `/app`.
- User uploads/pastes profile info and profile bank updates.
- User creates Application A and Application B.
- Each application has separate chat history.
- Application memory updates after chat.
- Generated draft is saved to the correct application.
- Signed-out user is redirected away from workspace.
- User cannot access another user's application by ID.
- Billing status route returns the expected state.

Quality gates:

- `npm run typecheck`
- `npm run build`
- unit/API tests
- browser E2E tests
- migration status check before deploy

## Phase 10: Production Readiness and Vercel Deployment

Status: planned.

Goal:

Deploy a reliable first production version.

Work:

- Rotate any exposed local secrets.
- Confirm Vercel env vars:
  - `DATABASE_URL`
  - `DATABASE_URL_UNPOOLED`
  - `NEXTAUTH_URL`
  - `NEXTAUTH_SECRET`
  - `OPENAI_API_KEY`
  - `OPENAI_MODEL`
  - OAuth provider vars if enabled
  - Stripe vars once billing is connected
- Add deployment checklist.
- Add basic logging/error handling.
- Add rate limits or abuse protection for AI and upload routes.
- Add privacy/data deletion plan.
- Verify deployed site manually and with browser tests.

Deliverables:

- Production deployment.
- Deployment checklist.
- Known issues list.
- First beta release notes.

Tests:

- Production smoke test.
- Signup/signin works on deployed URL.
- AI chat works on deployed URL.
- Profile upload works on deployed URL.
- Application creation and application-specific chat work on deployed URL.
- Billing status route works on deployed URL.
