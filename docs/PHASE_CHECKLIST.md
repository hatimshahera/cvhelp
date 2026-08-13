# CVhelp Phase Checklist

Use this as the live tracker while implementing the plan. Mark items complete only after the relevant acceptance criteria and tests pass.

## Phase 1: Documentation, Scope, and Tracking

- [x] Create `docs/IMPLEMENTATION_PLAN.md`.
- [x] Create `docs/ACCEPTANCE_CRITERIA.md`.
- [x] Create `docs/WHATS_DONE.md`.
- [x] Create `docs/DECISIONS.md`.
- [x] Create `docs/PHASE_CHECKLIST.md`.
- [ ] Review docs with product direction agreed.
- [ ] Update docs after review feedback.

## Phase 2: Data Model and Application Memory

- [x] Define stable TypeScript shapes for `ProfileBank` JSON.
- [x] Define stable TypeScript shapes for `Application` JSON.
- [x] Decide normalized vs JSON storage for sources, facts, artifacts, and versions.
- [x] Review `Conversation` uniqueness constraint for multiple chats per application.
- [x] Add Prisma migration for selected memory/artifact changes.
- [x] Add profile memory read/write helpers.
- [x] Add application memory read/write helpers.
- [ ] Add provenance fields for profile facts and application claims.
- [x] Add ProofCV-compatible application export shape.
- [x] Add import utility for existing `proofcv/applications/*` data.
- [x] Add tests for memory schema validation.
- [ ] Add tests for user/application memory isolation.
- [x] Run `npm run typecheck`.
- [x] Run `npm run build`.
- [x] Verify Prisma migration status.

## Phase 3: Auth, Sessions, and Account Safety

- [ ] Confirm production auth env requirements.
- [x] Improve signup error and loading states.
- [x] Improve signin error and loading states.
- [x] Add account settings shell.
- [x] Ensure all private app routes require signin.
- [x] Ensure all private API routes require signin.
- [ ] Add user ownership checks for application/detail/artifact routes.
- [x] Decide OAuth MVP scope.
- [ ] Add auth tests for signup/signin.
- [x] Add auth tests for protected routes.
- [ ] Add auth tests for cross-user access denial.
- [x] Run `npm run typecheck`.
- [x] Run `npm run build`.

## Phase 4: Profile Builder Chat System

- [x] Define canonical profile schema.
- [ ] Add guided intake states.
- [x] Add stronger profile-builder system instructions.
- [x] Add profile memory update validation.
- [ ] Add source cards UI.
- [x] Add editable profile facts UI.
- [ ] Add correction flow for saved facts.
- [ ] Add delete/exclude flow for saved facts.
- [x] Add profile completeness scoring.
- [ ] Add profile checklist based on actual evidence.
- [ ] Add tests for CV/text upload.
- [ ] Add tests for PDF extraction behavior.
- [ ] Add tests for chat-to-profile extraction.
- [ ] Add tests for corrections and deletions.
- [ ] Add grounding tests to prevent invented facts.
- [x] Run `npm run typecheck`.
- [x] Run `npm run build`.

## Phase 5: Application Workspace System

- [ ] Improve application creation from pasted job descriptions.
- [ ] Improve application creation from job URLs.
- [x] Add application detail route or detail panel.
- [ ] Add application overview panel.
- [x] Add editable application metadata.
- [x] Add application status controls.
- [x] Add archive behavior.
- [x] Add application next-action field.
- [ ] Add job requirement extraction.
- [ ] Add matched evidence storage.
- [ ] Add gap/risk/honesty notes storage.
- [ ] Add selected projects/research/experience storage.
- [ ] Add per-application memory panel.
- [x] Add separate chats per application.
- [x] Add support for multiple task chats if selected.
- [ ] Add tests for application creation.
- [ ] Add tests for switching application chats.
- [x] Add tests for application memory isolation.
- [x] Add tests for status/archive persistence.
- [x] Run `npm run typecheck`.
- [x] Run `npm run build`.

## Phase 6: Generation and Outputs

- [ ] Define artifact data model.
- [ ] Add artifact versioning.
- [ ] Add tailored CV generation route.
- [ ] Add cover note/recruiter message generation route.
- [ ] Add application Q&A generation route.
- [ ] Add artifact review UI.
- [ ] Add regenerate/refine flow.
- [ ] Add ProofCV-compatible `cv_data` export.
- [ ] Decide PDF rendering strategy.
- [ ] Add PDF or TeX export route.
- [ ] Add artifact download flow.
- [ ] Add tests for artifact generation.
- [ ] Add tests for version history.
- [ ] Add tests for export scoping.
- [ ] Add tests for unsupported-claim prevention.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.

## Phase 7: Payments and Subscription Routes

- [ ] Add billing/subscription schema.
- [ ] Add `GET /api/billing/status`.
- [ ] Add `POST /api/billing/checkout`.
- [ ] Add `POST /api/billing/portal`.
- [ ] Add `POST /api/billing/webhook`.
- [ ] Add Stripe env var docs.
- [ ] Add free/default billing state.
- [ ] Add feature gate helper.
- [ ] Add application count limit gate.
- [ ] Add generation/export limit gate.
- [ ] Add upload limit gate.
- [ ] Add billing status UI placeholder.
- [ ] Add tests for auth on billing routes.
- [ ] Add tests for free/default billing status.
- [ ] Add tests for feature gates.
- [ ] Add Stripe webhook signature test after Stripe is connected.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.

## Phase 8: UI Polish and Product Flow

- [ ] Redesign workspace layout.
- [ ] Add profile review screen/panel.
- [ ] Add application overview screen/panel.
- [ ] Add memory/output side panel.
- [ ] Add artifact cards.
- [ ] Add status badges.
- [ ] Add progress indicators.
- [ ] Improve chat message rendering.
- [ ] Improve empty states.
- [ ] Improve loading states.
- [ ] Improve error states.
- [ ] Make mobile layout usable.
- [ ] Check keyboard accessibility.
- [ ] Check text overflow and overlap.
- [ ] Add browser smoke tests for main pages.
- [ ] Add desktop visual checks.
- [ ] Add mobile visual checks.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.

## Phase 9: End-to-End Tests and Quality Gates

- [ ] Choose test runner setup.
- [ ] Add test database setup.
- [ ] Add mocked OpenAI response utilities.
- [ ] Add CV text fixture.
- [ ] Add job post fixture.
- [ ] Add application data fixture.
- [ ] Add signup/signin E2E test.
- [ ] Add profile builder E2E test.
- [ ] Add application creation E2E test.
- [ ] Add separate application chats E2E test.
- [ ] Add generation/artifact E2E test.
- [ ] Add billing route E2E or integration test.
- [ ] Add cross-user access denial tests.
- [ ] Add local quality script.
- [ ] Run full quality gate.

## Phase 10: Production Readiness and Vercel Deployment

- [ ] Rotate any exposed or shared secrets.
- [ ] Confirm Vercel `DATABASE_URL`.
- [ ] Confirm Vercel `DATABASE_URL_UNPOOLED`.
- [ ] Confirm Vercel `NEXTAUTH_URL`.
- [ ] Confirm Vercel `NEXTAUTH_SECRET`.
- [ ] Confirm Vercel `OPENAI_API_KEY`.
- [ ] Confirm Vercel `OPENAI_MODEL`.
- [ ] Confirm OAuth env vars if enabled.
- [ ] Confirm Stripe env vars if billing enabled.
- [ ] Apply production migrations.
- [ ] Add basic logging/error handling.
- [ ] Add AI route rate limits or usage controls.
- [ ] Add upload route protections.
- [ ] Add privacy/data deletion plan.
- [ ] Run production build.
- [ ] Deploy to Vercel.
- [ ] Run production smoke test for auth.
- [ ] Run production smoke test for profile chat.
- [ ] Run production smoke test for application chat.
- [ ] Run production smoke test for billing status.
- [ ] Write beta release notes.
