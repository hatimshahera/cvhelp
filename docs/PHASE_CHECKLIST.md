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
- [x] Add guided intake states.
- [x] Add stronger profile-builder system instructions.
- [x] Add profile memory update validation.
- [x] Add source cards UI.
- [x] Add editable profile facts UI.
- [x] Add correction flow for saved facts.
- [x] Add delete/exclude flow for saved facts.
- [x] Add profile completeness scoring.
- [x] Add profile checklist based on actual evidence.
- [ ] Add tests for CV/text upload.
- [ ] Add tests for PDF extraction behavior.
- [ ] Add tests for chat-to-profile extraction.
- [ ] Add tests for corrections and deletions.
- [ ] Add grounding tests to prevent invented facts.
- [x] Run `npm run typecheck`.
- [x] Run `npm run build`.

## Phase 5: Application Workspace System

- [x] Improve application creation from pasted job descriptions.
- [x] Improve application creation from job URLs.
- [x] Add application detail route or detail panel.
- [x] Add application overview panel.
- [x] Add editable application metadata.
- [x] Add application status controls.
- [x] Add archive behavior.
- [x] Add application next-action field.
- [x] Add job requirement extraction.
- [x] Add matched evidence storage.
- [x] Add gap/risk/honesty notes storage.
- [x] Add selected projects/research/experience storage.
- [x] Add per-application memory panel.
- [x] Add separate chats per application.
- [x] Add support for multiple task chats if selected.
- [x] Add tests for application creation.
- [x] Add tests for switching application chats.
- [x] Add tests for application memory isolation.
- [x] Add tests for status/archive persistence.
- [x] Run `npm run typecheck`.
- [x] Run `npm run build`.

## Phase 6: Generation and Outputs

- [x] Define artifact data model.
- [x] Add artifact versioning.
- [x] Add tailored CV generation route.
- [x] Add cover note/recruiter message generation route.
- [x] Add application Q&A generation route.
- [x] Add artifact review UI.
- [ ] Add regenerate/refine flow.
- [x] Add ProofCV-compatible `cv_data` export.
- [ ] Decide PDF rendering strategy.
- [ ] Add PDF or TeX export route.
- [x] Add artifact download flow.
- [x] Add tests for artifact generation.
- [x] Add tests for version history.
- [x] Add tests for export scoping.
- [x] Add tests for unsupported-claim prevention.
- [x] Run `npm run typecheck`.
- [x] Run `npm run build`.

## Phase 7: Payments and Subscription Routes

- [x] Add billing/subscription schema.
- [x] Add `GET /api/billing/status`.
- [x] Add `POST /api/billing/checkout`.
- [x] Add `POST /api/billing/portal`.
- [x] Add `POST /api/billing/webhook`.
- [x] Add Stripe env var docs.
- [x] Add free/default billing state.
- [x] Add feature gate helper.
- [x] Add application count limit gate.
- [x] Add generation/export limit gate.
- [x] Add upload limit gate.
- [x] Add billing status UI placeholder.
- [x] Add tests for auth on billing routes.
- [x] Add tests for free/default billing status.
- [x] Add tests for feature gates.
- [ ] Add Stripe webhook signature test after Stripe is connected.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.

## Phase 8: UI Polish and Product Flow

- [ ] Redesign workspace layout.
- [x] Add profile review screen/panel.
- [x] Add application overview screen/panel.
- [x] Add memory/output side panel.
- [x] Add artifact cards.
- [x] Add status badges.
- [x] Add progress indicators.
- [x] Improve chat message rendering.
- [x] Improve empty states.
- [x] Improve loading states.
- [x] Improve error states.
- [x] Make mobile layout usable.
- [x] Check keyboard accessibility.
- [x] Check text overflow and overlap.
- [ ] Add browser smoke tests for main pages.
- [ ] Add desktop visual checks.
- [ ] Add mobile visual checks.
- [x] Run `npm run typecheck`.
- [x] Run `npm run build`.

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
- [x] Add cross-user access denial tests.
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
