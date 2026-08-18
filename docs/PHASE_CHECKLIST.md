# CVhelp Phase Checklist

Use this as the live tracker while implementing the production chat-agent refactor. Mark items complete only after the relevant acceptance criteria and tests pass.

## Phase 1: Documentation and Architecture Lock

- [x] Inspect current `/api/chat`, Prisma schema, application routes, profile routes, upload route, UI shell, and tests.
- [x] Identify reusable current behavior: scoped conversations, application memory, artifacts, profile bank, billing gates, upload limits, and existing tests.
- [x] Decide General Chat will become the primary intake/router for new applications.
- [x] Decide Applications sidebar becomes navigation/search/status rather than the primary creation surface.
- [x] Decide profile-related General Chat content is routed through explicit handoff, not silent profile mutation.
- [x] Update `docs/IMPLEMENTATION_PLAN.md`.
- [x] Update `docs/PHASE_CHECKLIST.md`.
- [x] Add `docs/CHAT_ARCHITECTURE.md`.
- [x] Update `docs/DECISIONS.md`.
- [x] Update `docs/ACCEPTANCE_CRITERIA.md`.
- [x] Update `docs/WHATS_DONE.md`.
- [x] Review `git diff -- docs`.

Tests:

- [x] Documentation-only phase; no runtime tests required.

## Phase 2: Refactor Foundations Without Behavior Change

- [x] Add `src/lib/chat/types.ts`.
- [x] Add `src/lib/ai/models.ts`.
- [x] Add `src/lib/ai/json.ts`.
- [x] Add `src/lib/ai/agents.ts`.
- [x] Add `src/lib/ai/memory-updates.ts`.
- [x] Move model selection out of `/api/chat`.
- [x] Move JSON parsing out of `/api/chat`.
- [x] Move agent instructions out of `/api/chat`.
- [x] Move profile memory update sidecar out of `/api/chat`.
- [x] Move application memory update sidecar out of `/api/chat`.
- [x] Preserve current `/api/chat` request body shape.
- [x] Preserve current `/api/chat` response body shape.
- [x] Preserve public `build_profile` mode.
- [x] Keep application chat and profile chat behavior unchanged.

Tests:

- [x] Add unit tests for agent selection.
- [x] Add unit tests for global/user/agent instruction ordering.
- [x] Existing `/api/chat` tests pass.
- [x] Profile chat still updates profile bank.
- [x] Application chat still updates only selected application memory.
- [x] `npm run typecheck`.
- [x] `npm test`.
- [x] `npm run build`.
- [x] `npx prisma validate`.

## Phase 3: Scoped Context Builder

- [x] Add `src/lib/chat/conversations.ts`.
- [x] Add `src/lib/chat/context.ts`.
- [x] Move get/create conversation logic out of `/api/chat`.
- [x] Move clear conversation logic out of `/api/chat`.
- [x] Move recent message loading out of `/api/chat`.
- [x] Build Profile Agent context from profile conversation, profile summary, profile sources, and user preferences.
- [x] Build Application Agent context from one application conversation, selected application state, relevant profile facts, global preferences, and relevant sources.
- [x] Build General Agent context from general conversation and safe high-level workspace summaries only.
- [x] Bound context size.
- [x] Ensure current user message is never dropped by truncation.

Tests:

- [x] Application A context excludes Application B memory and messages.
- [x] Profile context excludes application memory.
- [x] General context excludes full application memories by default.
- [x] Rate limits still run before model calls.
- [x] `/api/chat` response remains frontend-compatible.
- [x] `npm run typecheck`.
- [x] `npm test`.
- [x] `npm run build`.

## Phase 4: General Chat Router and Handoffs

- [x] Add visible General Chat rail entry.
- [x] Extend frontend `ChatMode` to include `general`.
- [x] Add General Chat title, description, empty state, and composer placeholder.
- [x] Add typed assistant action payload support.
- [x] Render assistant action buttons under chat messages.
- [x] Add deterministic action `create_application_from_job_source`.
- [x] Reuse current job source resolution, metadata inference, summary extraction, memory initialization, and conversation creation.
- [x] Return `open_application_chat` action after application creation.
- [x] Wire `open_application_chat` action to switch UI to the new application chat.
- [x] Add deterministic action `handoff_to_profile_chat`.
- [x] Create a concise destination Profile Chat handoff note.
- [x] Return `continue_in_profile_chat` action after profile handoff.
- [x] Wire `continue_in_profile_chat` action to open Profile Chat.
- [x] Keep `/api/applications` POST working for backwards compatibility during transition.
- [x] De-emphasize or remove the sidebar job-description form only after General creation works.

Tests:

- [x] General Chat can create an application from pasted job text through deterministic backend code.
- [x] General Chat can create an application from a readable job URL with mocked fetch.
- [x] New application includes job post, job summary, memory, and scoped application conversation.
- [x] Returned action contains the new user-owned application ID.
- [x] General Chat cannot create an application for another user.
- [x] General Chat profile handoff does not update profile bank directly.
- [x] Profile handoff creates an auditable note in the profile conversation.
- [x] Existing application creation API still works.
- [x] `npm run typecheck`.
- [x] `npm test`.
- [x] `npm run build`.

## Phase 5: First-Class Sources and Attachments

- [ ] Add Prisma migration for `Source`.
- [ ] Add Prisma migration for `ChatMessageSource`.
- [ ] Consider adding `ChatMessage.metadata Json?`.
- [ ] Keep `ProfileBank.rawSources` readable for existing data.
- [ ] Update upload route to create source rows.
- [ ] Preserve current profile source summary UI.
- [ ] Add source scopes: `profile`, `application`, `general`.
- [ ] Allow General Chat sources to become application sources during application creation.
- [ ] Allow Application Chat file uploads to stay application-scoped.
- [ ] Stop appending full uploaded source text into chat messages.
- [ ] Context builder retrieves source snippets by scope and ownership.

Tests:

- [ ] Cross-user source IDs are rejected.
- [ ] Application source cannot be attached to another application chat.
- [ ] General source converted into an application is owned by that application.
- [ ] Existing profile uploads still update profile source UI.
- [ ] Upload billing and rate limits still apply.
- [ ] `npm run typecheck`.
- [ ] `npm test`.

## Phase 6: Conversation Summaries and Relevant Retrieval

- [ ] Add Prisma migration for `Conversation.summary`.
- [ ] Add Prisma migration for `Conversation.lastSummarizedMessageId`.
- [ ] Add `src/lib/chat/summaries.ts`.
- [ ] Summarize only after configured message threshold.
- [ ] Retrieve recent messages plus summary plus relevant older messages.
- [ ] Start with deterministic scoped keyword retrieval.
- [ ] Add model-assisted relevance only if needed.
- [ ] Add context budget tests.

Tests:

- [ ] Summary is skipped below threshold.
- [ ] Summary update is scoped to the same conversation.
- [ ] Older-message retrieval is scoped to the same conversation.
- [ ] Context budget preserves current turn.
- [ ] `npm run typecheck`.
- [ ] `npm test`.

## Phase 7: Memory Write Discipline

- [ ] Profile Agent updates global profile facts/preferences.
- [ ] Application Agent updates only selected application memory by default.
- [ ] General Agent proposes actions/handoffs but does not directly write profile facts.
- [ ] Add explicit deterministic promotion flow for reusable facts discovered during application work.
- [ ] Validate all sidecar memory JSON before saving.
- [ ] Preserve existing memory on malformed sidecar output.
- [ ] Log memory update failures without sensitive source text.

Tests:

- [ ] Application chat does not call `profileBank.update` without explicit promotion.
- [ ] Profile chat does not update application memory.
- [ ] General chat does not directly update profile facts.
- [ ] Malformed memory JSON preserves existing state.
- [ ] Profile corrections replace conflicting facts.
- [ ] `npm run typecheck`.
- [ ] `npm test`.

## Phase 8: Deterministic Platform Tools

- [ ] Add action registry schemas.
- [ ] Add action permission checks.
- [ ] Add action audit metadata.
- [ ] Add `archive_application`.
- [ ] Add `restore_application`.
- [ ] Add `update_application_status`.
- [ ] Add `rename_application`.
- [ ] Add `compare_applications`.
- [ ] Require explicit user confirmation for destructive/status-changing actions.

Tests:

- [ ] Cross-user application IDs are rejected.
- [ ] Invalid status transitions are rejected.
- [ ] Malformed model action payloads are ignored safely.
- [ ] Destructive actions require confirmation.
- [ ] `npm run typecheck`.
- [ ] `npm test`.

## Phase 9: UI Flow and Regression Polish

- [ ] Keep existing profile chat/editor UX recognizable.
- [ ] Keep existing application chat/workspace UX recognizable.
- [ ] Convert Applications sidebar to navigation/search/status.
- [ ] Add consistent assistant action button styling.
- [ ] Add General Chat empty state.
- [ ] Add Profile Chat handoff empty/notice state if useful.
- [ ] Add Application Chat creation-success transition.
- [ ] Check desktop layout.
- [ ] Check mobile layout.
- [ ] Check keyboard accessibility.
- [ ] Check text overflow and overlap.

Tests:

- [ ] Browser smoke test for General Chat.
- [ ] Browser smoke test for Profile Chat handoff.
- [ ] Browser smoke test for application creation from General Chat.
- [ ] Browser smoke test for switching to new application chat.
- [ ] No client console errors in core flows.
- [ ] `npm run typecheck`.
- [ ] `npm test`.
- [ ] `npm run build`.

## Phase 10: Production Readiness

- [ ] Verify fresh database migrations.
- [ ] Verify migration path from existing data.
- [ ] Confirm Vercel `DATABASE_URL`.
- [ ] Confirm Vercel `DATABASE_URL_UNPOOLED`.
- [ ] Confirm Vercel `NEXTAUTH_URL`.
- [ ] Confirm Vercel `NEXTAUTH_SECRET`.
- [ ] Confirm Vercel `OPENAI_API_KEY`.
- [ ] Confirm Vercel `OPENAI_MODEL`.
- [ ] Confirm billing behavior after chat refactor.
- [ ] Run production build.
- [ ] Deploy.
- [ ] Smoke test auth in production.
- [ ] Smoke test General Chat application creation in production.
- [ ] Smoke test Profile Chat handoff in production.
- [ ] Smoke test Application Chat isolation in production.

Tests:

- [ ] `npm run typecheck`.
- [ ] `npm test`.
- [ ] `npm run build`.
- [ ] `npx prisma migrate status`.
