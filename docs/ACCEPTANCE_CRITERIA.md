# CVhelp Acceptance Criteria

This file defines what must be true before each area is considered complete. Use it as the checklist before merging or moving to the next phase.

## Global Completion Standard

A feature is complete only when:

- It works for a signed-in user.
- It rejects signed-out users.
- It scopes all data to the current user.
- It persists expected data in Postgres.
- It has useful loading and error states.
- It has at least one automated test at the right level.
- It passes `npm run typecheck`.
- It passes `npm run build`.
- It does not require inspecting raw database rows to use the feature.

## Authentication

Acceptance criteria:

- A new user can create an account with name, email, and password.
- Existing users cannot sign up twice with the same email.
- A user can sign in and reach `/app`.
- A signed-out visitor is redirected from `/app` to `/sign-in`.
- Private APIs return `401` for signed-out requests.
- Auth session includes the user ID.
- OAuth buttons only appear when provider env vars are configured.
- Production auth uses a real `NEXTAUTH_SECRET` and correct `NEXTAUTH_URL`.

Tests:

- Signup success.
- Duplicate signup failure.
- Signin success.
- Invalid signin failure.
- Protected route redirect.
- Protected API rejection.

## Profile Builder

Acceptance criteria:

- The profile builder has a dedicated chat and memory scope.
- Uploaded text and PDF files are saved as raw profile sources.
- Pasted profile information is saved as raw profile source or chat source.
- The profile agent extracts structured facts into the profile bank.
- Profile facts include enough provenance to trace them to source content or chat turns.
- Corrections update existing facts instead of creating conflicting duplicates.
- Delete/remove requests either remove facts or mark them excluded.
- The profile checklist reflects actual stored evidence.
- The profile builder asks focused follow-up questions when data is missing.
- The profile builder never invents credentials, dates, employers, links, metrics, or projects.

Tests:

- Upload stores source.
- PDF extraction path stores text when extraction succeeds.
- Failed PDF extraction stores metadata and useful user-facing message.
- Chat message updates raw sources and master profile.
- Correction updates the relevant profile field.
- User A cannot read User B profile bank.

## Applications

Acceptance criteria:

- A signed-in user can create an application from a pasted job description through General Chat.
- A signed-in user can create an application from a readable job URL through General Chat.
- The existing direct application creation API remains backwards-compatible until the General Chat flow fully replaces the sidebar creation UX.
- The application stores company, role, slug, status, job post content, source, and captured date.
- Application metadata can be edited.
- Application status can be changed.
- Applications can be archived without deleting their history.
- Application data stores ProofCV-like fields:
  - candidate snapshot
  - target company and role
  - selected projects
  - selected research
  - selected experience
  - fit points
  - profile summary
  - honesty notes
  - generated drafts
  - final artifacts
- Each application has isolated memory.
- Application A chat cannot see Application B chat or memory.

Tests:

- Create application from General Chat paste.
- Create application from General Chat URL with mocked fetch.
- Direct application creation API remains compatible.
- List only current user's applications.
- Update application status.
- Archive application.
- Verify application memory isolation.

## General Chat Router

Acceptance criteria:

- General Chat is visible in the workspace navigation.
- General Chat has its own durable conversation.
- General Chat can answer broader career and cross-application questions without requiring an application.
- General Chat uses safe workspace summaries by default, not full unrelated application memories.
- General Chat does not include workspace summaries or call the model for simple greetings, pings, or "does this work" checks.
- General Chat can propose application creation from a job description or URL.
- Application creation is executed by deterministic backend code, not direct model state mutation.
- Successful application creation returns an action button to open the new application chat.
- Opening the new application chat loads the created application and its saved job context.
- Profile-related comments in General Chat do not directly update the profile bank.
- Profile-related comments can create an explicit Profile Chat handoff.
- Profile handoff context is concise, visible, and auditable in the destination profile conversation.

Tests:

- General Chat loads for a signed-in user.
- General Chat rejects signed-out requests.
- General Chat creates an application through the deterministic action.
- New application from General Chat is scoped to the signed-in user.
- General Chat does not include full unrelated application memory in default context.
- General Chat health-check messages skip workspace context and model calls.
- Returned `open_application_chat` action contains a user-owned application ID.
- Returned `continue_in_profile_chat` action creates or targets the signed-in user's profile conversation.
- General Chat profile handoff does not call profile-bank update directly.

## Application Chats

Acceptance criteria:

- Each application has at least one separate chat thread.
- Chat messages are stored durably.
- Reloading the page restores the correct application chat.
- Switching applications loads the selected application's chat.
- The application chat receives profile bank context and selected application context.
- Application chat updates application-specific notes/memory after useful turns.
- Clearing profile chat does not delete the profile bank.
- Application chat clearing/archive behavior is explicit and does not delete generated artifacts by accident.

Tests:

- Send message in application chat.
- Reload and verify message remains.
- Create two applications and verify separate histories.
- Verify application notes update after chat.
- Verify unauthorized access by another user fails.

## AI Memory and Agent Behavior

Acceptance criteria:

- Profile memory and application memory have stable schemas.
- AI updates are parsed and validated before saving.
- Invalid AI JSON does not corrupt existing memory.
- Agent responses are grounded in stored user data and job post data.
- The system distinguishes global reusable profile facts from application-specific notes.
- Application-specific claims are not written to the global profile unless the user explicitly asks.
- General Chat does not write profile facts directly; it creates handoffs to Profile Chat.
- State-changing agent actions are validated and executed by backend functions.
- The app stores enough context to explain why a draft used a project, skill, or claim.

Tests:

- Valid memory update saves.
- Invalid memory update is ignored or handled gracefully.
- Application note does not pollute global profile.
- Explicit profile update request creates or uses a supported profile update/handoff path.
- General Chat profile discussion creates a handoff rather than mutating profile bank.
- Deterministic action payloads reject unauthorized IDs.
- Deterministic application management actions require explicit confirmation before mutation.
- Application management actions append audit metadata to application notes.
- AI failure rolls back only the failed chat turn when appropriate.
- Long conversations use recent messages, rolling summaries, and scoped relevant older messages instead of sending unbounded history.
- Conversation summaries are generated only after the configured threshold and remain scoped to the current conversation.

## Generation and Artifacts

Acceptance criteria:

- User can generate a tailored CV draft for an application.
- User can generate a cover note or recruiter message.
- User can generate answers for pasted application questions.
- Generated content is saved as an artifact under the correct application.
- Artifacts have version history.
- User can review, refine, and regenerate artifacts.
- User can export ProofCV-compatible `cv_data`.
- PDF export either works or returns a clear actionable error.
- Generated artifacts do not invent unsupported claims.

Tests:

- Generate CV draft.
- Generate cover note.
- Regenerate creates new version.
- Export `cv_data` includes expected fields.
- Unauthorized artifact access fails.

## Payments and Billing

Acceptance criteria:

- Billing routes exist behind auth:
  - `POST /api/billing/checkout`
  - `POST /api/billing/portal`
  - `POST /api/billing/webhook`
  - `GET /api/billing/status`
- Billing status returns a free/default state before Stripe is connected.
- Stripe route code is isolated from business logic.
- Feature gates can limit applications, chats, generations, exports, and uploads.
- Over-limit users get clear messages.
- Pricing can be changed without rewriting the whole app.

Tests:

- Signed-out billing status fails or returns only public-safe information.
- Signed-in billing status returns current plan state.
- Checkout route rejects when Stripe is not configured.
- Feature gate blocks over-limit action.
- Webhook signature validation is tested once Stripe is connected.

## UI Polish

Acceptance criteria:

- The app has a clear workspace layout.
- Profile builder and applications are visually distinct.
- Each application shows status, memory, next action, and saved drafts.
- Empty states tell the user what action is available next.
- Loading states are visible for chat, upload, application creation, generation, and billing.
- Errors are visible and recoverable.
- Mobile layout is usable.
- Text does not overlap at common viewport sizes.
- Buttons and controls are accessible by keyboard.

Tests:

- Browser smoke test for landing page.
- Browser smoke test for signup/signin.
- Browser smoke test for workspace.
- Browser smoke test for creating and switching applications.
- Visual check at desktop and mobile widths.
- No client console errors in core flows.

## Deployment

Acceptance criteria:

- All required Vercel env vars are set.
- Database migrations are applied before production traffic uses new schema.
- Production build succeeds.
- Deployed auth callback URLs are correct.
- OpenAI key is configured.
- Stripe keys are configured only when billing is enabled.
- Known secrets from local files are rotated if they were exposed.
- Production smoke tests pass.

Tests:

- `npm run typecheck`
- `npm run build`
- `npx prisma migrate status`
- Deployed signup/signin smoke test.
- Deployed profile chat smoke test.
- Deployed application chat smoke test.
