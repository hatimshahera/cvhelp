# CVhelp Chat Architecture Implementation Plan

This plan tracks the incremental refactor from the current working CVhelp app to a production-grade three-agent chat system. The goal is not a rewrite. The goal is to preserve current behavior while making agent boundaries, context building, memory writes, application creation, and handoffs explicit, testable, and cheap to operate.

## Current Baseline

- Next.js app under `cvhelp/` with Auth.js, Prisma/Postgres, OpenAI Responses API, billing route boundaries, and Vitest.
- `/api/chat` already accepts `build_profile`, `application`, and `general` modes.
- The UI currently exposes profile chat/editor and application-specific chats, but not a visible General Chat.
- `/api/chat` currently contains most AI logic inline: agent instructions, context construction, OpenAI calls, profile updates, and application memory updates.
- `Conversation` already supports `mode`, `applicationId`, and `threadKey`.
- `Application` already stores job post, summary, memory, candidate snapshot, selected evidence, notes, drafts, and artifacts.
- `ApplicationArtifact` already supports generated/versioned outputs.
- File upload currently saves sources to the profile bank and appends a short upload notice into the chat message.
- Application creation currently happens from the Applications sidebar form.

## Product Direction

CVhelp will have three clearly scoped chat agents:

- Profile Agent: owns reusable global career/profile facts, evidence, and global CV/application preferences. It must never invent user facts.
- Application Agent: owns one application workspace and uses only that application conversation, job/application state, relevant profile facts, relevant sources, and global preferences. It must not pollute unrelated applications or the global profile.
- General Agent: owns cross-application and platform-level work. It is the primary intake/router for new job descriptions and profile-change handoffs.

The General Chat becomes the front door for creating applications:

- The user can paste or discuss a job description in General Chat.
- The General Agent can propose a deterministic backend action to create an application.
- Backend code validates, creates the application/job state, creates the isolated application conversation, and returns an action button to open the new application chat.
- The Applications sidebar becomes navigation/search/status, not the primary creation surface.

The General Chat also routes profile-related changes:

- If the user discusses reusable profile facts or global CV preferences in General Chat, the General Agent does not silently mutate the profile.
- It offers a handoff action to continue in Profile Chat.
- The destination Profile Chat receives a concise, auditable handoff note explaining why the user is there and what should be confirmed or saved.

## Production Standards

Every phase must meet these standards before it is marked complete:

- Existing working behavior remains available unless explicitly replaced by a tested flow.
- User/application ownership is checked in deterministic backend code.
- The model never directly writes database state.
- AI-proposed actions are validated by backend schemas before execution.
- Profile writes happen only through Profile Agent flows or explicit deterministic promotion flows.
- Application writes stay scoped to the selected application.
- Context builders enforce scope before text reaches the model.
- Prompt/context size is bounded.
- New behavior has automated tests at the right level.
- `npm run typecheck` and relevant Vitest suites pass.
- Important decisions and trade-offs are documented.

## Phase 1: Documentation and Architecture Lock

Goal:

Bring docs in line with the real repository and lock the new three-agent direction before code changes.

Work:

- Update current implementation docs to remove stale claims about missing artifacts, billing, and tests.
- Document Profile, Application, and General Agent responsibilities.
- Document General Chat as the application creation and routing surface.
- Document deterministic backend actions and handoff behavior.
- Document proposed files, schema changes, and test strategy.

Deliverables:

- `docs/IMPLEMENTATION_PLAN.md`
- `docs/PHASE_CHECKLIST.md`
- `docs/DECISIONS.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/CHAT_ARCHITECTURE.md`
- `docs/WHATS_DONE.md`

Tests:

- Documentation-only phase. No runtime tests required.
- Run a repository status check and inspect changed docs.

## Phase 2: Refactor Foundations Without Behavior Change

Goal:

Make `/api/chat` a thin coordinator without changing current API behavior.

Work:

- Add shared chat mode/types helpers.
- Add central model selection/cost policy helper.
- Add shared JSON parsing helper for model sidecar outputs.
- Add agent definitions for Profile, Application, and General.
- Add shared CVHelp global rules.
- Add user preference extraction from existing `ProfileBank.masterProfile.preferences` and `constraints`.
- Move profile/application memory update functions out of `/api/chat`.
- Keep public `build_profile` mode for backwards compatibility while internally naming the agent `profile`.
- Keep current request and response shapes.

Likely files:

- `src/lib/chat/types.ts`
- `src/lib/ai/models.ts`
- `src/lib/ai/json.ts`
- `src/lib/ai/agents.ts`
- `src/lib/ai/memory-updates.ts`

Tests:

- Existing `/api/chat` tests still pass.
- Unit tests for agent selection.
- Unit tests for instruction ordering: global rules, user preferences, agent-specific instructions.
- Regression test that profile chat still updates profile bank.
- Regression test that application chat still updates only selected application memory.

## Phase 3: Scoped Context Builder

Goal:

Replace inline prompt assembly with a scoped context builder that is explicit, bounded, and reusable.

Work:

- Add conversation helpers for get/create/clear and ownership checks.
- Add context builder for recent messages, user preferences, profile summary, application state, and source snippets.
- Keep recent message behavior initially equivalent to today.
- Ensure General Chat receives only general conversation context and selected safe summaries by default.
- Ensure Application Chat receives only the selected application state.
- Ensure Profile Chat receives profile bank context but no unrelated application memory.

Likely files:

- `src/lib/chat/conversations.ts`
- `src/lib/chat/context.ts`
- `src/lib/chat/context.test.ts`

Tests:

- Application A context never includes Application B state.
- Profile context never includes application memory.
- General context does not include full application memories by default.
- API response shape remains compatible with current frontend.
- Rate limits still apply before model calls.

## Phase 4: General Chat Router and Handoffs

Goal:

Expose General Chat and make it the production application/profile routing layer.

Work:

- Add visible General Chat navigation with minimal UI changes.
- De-emphasize or remove the existing "Add job description" form from the Applications sidebar after the General flow is working.
- Add a typed chat action response format for assistant messages.
- Render action buttons under assistant messages.
- Add deterministic backend action `create_application_from_job_source`.
- Reuse existing application creation logic for pasted job descriptions and URLs.
- Return an `open_application_chat` action after successful application creation.
- Add deterministic backend action `handoff_to_profile_chat`.
- Create or update the destination profile conversation with a concise handoff note.
- Return a `continue_in_profile_chat` action after profile handoff creation.
- Preserve direct `/api/applications` creation for backwards compatibility and tests.

Likely files:

- `src/lib/tools/application-actions.ts`
- `src/lib/chat/actions.ts`
- `src/lib/chat/handoffs.ts`
- `src/components/app-shell.tsx`
- `src/app/api/chat/route.ts`

Tests:

- General Chat can propose application creation from pasted job text.
- Backend creates the application only through the deterministic action.
- New application has job post, summary, memory, and default application conversation.
- Action button payload contains only user-owned application IDs.
- Clicking/opening action loads the new isolated application chat.
- General Chat profile-related content does not update profile bank directly.
- Profile handoff creates an auditable destination note.
- Existing application creation API still works.

## Phase 5: First-Class Sources and Attachments

Goal:

Stop treating attachments as appended message text and make sources first-class, scoped records.

Work:

- Add normalized `Source` table.
- Add `ChatMessageSource` join table.
- Keep existing `ProfileBank.rawSources` during migration for backwards compatibility.
- Update uploads to create source rows and preserve the current profile-source behavior.
- Support source scopes: `profile`, `application`, and `general`.
- Allow General Chat to attach a job source and convert it into an application source during creation.
- Allow Application Chat to attach application-specific files without polluting the profile bank.
- Context builder retrieves relevant source snippets by ID and scope.

Likely schema:

- `Source(id, userId, scope, applicationId, kind, name, mimeType, sizeBytes, textContent, metadata, createdAt, updatedAt)`
- `ChatMessageSource(messageId, sourceId, userId, createdAt)`
- Optional `ChatMessage.metadata Json?`

Tests:

- Source ownership checks reject cross-user source IDs.
- Application source cannot be attached to another application chat.
- General source converted into a new application remains scoped to that application.
- Existing profile-source UI still shows older raw sources.
- Upload limits and billing gates still apply.

## Phase 6: Conversation Summaries and Relevant Retrieval

Goal:

Keep chat fast and inexpensive as histories grow.

Work:

- Add conversation summary storage.
- Summarize only after threshold crossings, not on every message.
- Use recent messages plus summary plus relevant older messages.
- Start with deterministic keyword retrieval scoped to the conversation.
- Add model-assisted relevance only if deterministic retrieval is insufficient.
- Bound prompt size by character/token budgets.

Likely schema:

- `Conversation.summary Json?`
- `Conversation.lastSummarizedMessageId String?`

Tests:

- Summary is skipped below threshold.
- Summary updates preserve recent message behavior.
- Older-message retrieval stays scoped to one conversation.
- Context budget truncates predictable sections before dropping current user message.

## Phase 7: Memory Write Discipline

Goal:

Make memory/state updates explicit, validated, and scoped.

Work:

- Profile Agent may update global profile facts and preferences.
- Application Agent may update only selected application memory by default.
- General Agent may propose deterministic actions and handoffs, but does not directly write profile facts.
- Add explicit deterministic promotion flow if application evidence should become reusable profile memory.
- Validate sidecar model JSON with strict schemas before saving.
- Preserve existing memory on invalid sidecar output.
- Log memory-update failures without leaking CV/job content.

Tests:

- Application chat never calls `profileBank.update` without explicit supported promotion.
- Profile chat never updates application memory.
- General chat never directly writes profile bank facts.
- Malformed memory update JSON preserves existing data.
- Corrections replace facts instead of duplicating conflicting facts.

## Phase 8: Deterministic Platform Tools

Goal:

Let agents invoke safe backend actions while backend code remains the source of truth.

Work:

- Define action registry with schemas, permissions, and audit metadata.
- Candidate actions:
  - `create_application_from_job_source`
  - `open_application_chat`
  - `handoff_to_profile_chat`
  - `archive_application`
  - `restore_application`
  - `update_application_status`
  - `rename_application`
  - `compare_applications`
- Separate action proposal from action execution.
- Require explicit user click/confirmation for destructive or status-changing actions.

Tests:

- Cross-user application IDs are rejected.
- Archive/restore/status update actions validate allowed transitions.
- Model-proposed malformed action payloads are ignored or returned as safe errors.
- Action audit metadata is saved where appropriate.

## Phase 9: UI Flow and Regression Polish

Goal:

Make the new workflow feel native without a major redesign.

Work:

- Add General Chat as a top-level rail entry.
- Keep Profile and Application chat layouts familiar.
- Convert Applications sidebar into navigation/search/status.
- Render assistant action buttons consistently.
- Add clear empty states:
  - General Chat: paste a job, ask career/application questions, or route profile changes.
  - Profile Chat: add or confirm reusable facts/preferences.
  - Application Chat: tailor outputs for this saved application.
- Ensure mobile layout still works after adding General Chat.

Tests:

- Component-level tests where practical.
- Browser smoke tests for General Chat, Profile Chat, and Application Chat.
- Desktop and mobile visual checks.
- No text overlap in navigation/actions/composer.

## Phase 10: Production Readiness

Goal:

Ship the refactor safely.

Work:

- Run full quality gate.
- Verify Prisma migrations on a fresh database.
- Verify migration path from existing data.
- Confirm Vercel environment variables.
- Confirm OpenAI model settings.
- Confirm billing route behavior after changes.
- Run production smoke tests after deployment.

Tests:

- `npm run typecheck`
- `npm test`
- `npm run build`
- `npx prisma migrate status`
- Deployed smoke test for auth.
- Deployed smoke test for General Chat application creation.
- Deployed smoke test for Profile Chat handoff.
- Deployed smoke test for Application Chat isolation.
