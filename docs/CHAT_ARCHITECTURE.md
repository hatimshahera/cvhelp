# CVhelp Chat Architecture

This document defines the intended production architecture for CVhelp chat. It is the source of truth for the Profile Agent, Application Agent, General Agent, deterministic backend actions, context boundaries, and handoff behavior.

## Core Principle

The model may draft, classify, summarize, and propose actions. Backend code owns permissions, validation, storage, state transitions, and database writes.

## Agents

### Profile Agent

Owns reusable global career memory.

Responsibilities:

- Build and maintain the profile bank.
- Capture reusable facts: identity, links, education, experience, projects, research, skills, achievements, evidence, open questions.
- Capture global CV/application preferences: formatting, tone, bullet style, page limits, role preferences, location constraints, claims to avoid, and similar reusable guidance.
- Ask for evidence when facts are incomplete.
- Apply user corrections without inventing replacement facts.

Forbidden:

- Inventing credentials, employers, dates, project facts, links, metrics, or outcomes.
- Updating application-specific state.
- Treating one application positioning note as reusable profile truth without explicit user confirmation.

### Application Agent

Owns one isolated application workspace.

Responsibilities:

- Use the selected application conversation and application state.
- Use that job description, job summary, memory, notes, drafts, artifacts, and relevant attached sources.
- Use relevant global profile facts and global preferences.
- Help with CV tailoring, cover letters, recruiter messages, fit analysis, gaps, risks, application answers, and interview preparation.
- Keep drafts and notes scoped to the selected application.

Forbidden:

- Reading unrelated application conversations or memory.
- Writing global profile facts by default.
- Polluting another application.
- Inventing candidate facts or submitted status.

### General Agent

Owns cross-application, routing, and platform-level work.

Responsibilities:

- Answer broader career/workspace questions.
- Compare applications using safe summaries.
- Help manage applications through deterministic backend actions.
- Act as the primary intake surface for pasted job descriptions and job URLs.
- Propose application creation when the user provides a job source.
- Route profile-change topics to Profile Chat through explicit handoff.

Forbidden:

- Directly mutating profile facts.
- Directly mutating application state without a deterministic backend action.
- Reading full application memories unless the user requests a scoped comparison and backend selects the permitted context.

## Instruction Order

Every model call must assemble instructions in this order:

1. CVHelp global rules.
2. User-level global preferences from the profile bank.
3. Agent-specific instructions.
4. Scoped context notes.
5. Current user turn and selected conversation context.

Global rules include:

- Keep claims grounded.
- Do not invent user facts.
- Respect user/application isolation.
- Prefer concise, practical outputs.
- Ask focused questions when required facts are missing.

## Context Policy

Profile Chat context:

- Profile conversation summary and recent messages.
- Relevant older messages from the same profile conversation.
- Profile bank summary.
- Relevant profile facts and source snippets.
- Global preferences.

Application Chat context:

- Selected application conversation summary and recent messages.
- Relevant older messages from the same application conversation.
- Selected application job post/summary/memory/drafts/artifacts summary.
- Relevant global profile facts.
- Relevant application/profile source snippets.
- Global preferences.

General Chat context:

- General conversation summary and recent messages.
- Relevant older messages from the same general conversation.
- Safe workspace summaries such as application names, roles, statuses, and next actions.
- No full application memory by default.
- No profile source dump by default.

## General Chat Application Creation

Expected flow:

1. User pastes a job description or URL in General Chat.
2. General Agent identifies that an application could be created.
3. Assistant returns a proposed action or the backend classifier detects the job source.
4. Backend validates the action payload.
5. Backend resolves the job source, extracts/infer company and role, stores `jobPost`, stores `jobSummary`, initializes `Application.memory`, and creates the default application conversation.
6. Chat response includes an `open_application_chat` action button.
7. Clicking the button switches the UI to the new application chat.

Backend action:

```ts
create_application_from_job_source({
  jobSource: string,
  company?: string,
  role?: string,
  sourceIds?: string[]
})
```

Response action:

```ts
open_application_chat({
  applicationId: string,
  label: string
})
```

The existing `/api/applications` creation route should remain available for backwards compatibility and tests, but new UX should route users through General Chat.

## General Chat Profile Handoff

Expected flow:

1. User discusses reusable profile facts or preferences in General Chat.
2. General Agent recognizes that Profile Agent should own the update.
3. Assistant returns a `continue_in_profile_chat` action.
4. Backend creates a concise handoff note in the profile conversation.
5. Clicking the button opens Profile Chat.
6. Profile Agent asks for confirmation or saves only supported facts.

Backend action:

```ts
handoff_to_profile_chat({
  reason: string,
  proposedContext: string,
  sourceMessageIds?: string[]
})
```

Destination handoff note example:

```text
General Chat handoff: The user mentioned they may want one-page CVs, concise bullets, and a direct tone. Confirm whether these should be saved as global CV preferences.
```

The handoff note is intentionally short, visible, and auditable.

## Assistant Actions

Assistant responses may include user-facing action buttons. Actions are not model-written database mutations. They are typed requests that backend code validates and executes.

Action categories:

- Navigation: `open_application_chat`, `continue_in_profile_chat`.
- Creation: `create_application_from_job_source`.
- Application management: `archive_application`, `restore_application`, `update_application_status`, `rename_application`.
- Analysis: `compare_applications`.

Rules:

- Navigation actions can be immediate.
- Creation actions require valid payloads and ownership checks.
- Destructive/status-changing actions require explicit user confirmation.
- Malformed or unauthorized actions are ignored or returned as safe errors.

Implemented platform action execution:

- `POST /api/chat/actions` executes validated deterministic actions for signed-in users.
- Mutating application actions require `confirmed: true`.
- Application management actions check ownership with `userId` before writes.
- Mutating actions append an audit note to `Application.notes.entries`.
- `compare_applications` returns safe user-owned application summaries without mutating state.

## Memory Writes

Profile memory:

- Written by Profile Agent sidecar updates or direct profile editor routes.
- Validated against canonical profile schemas.
- Must preserve provenance where available.
- Malformed or schema-invalid sidecar JSON is ignored and the existing profile bank is preserved.

Application memory:

- Written by Application Agent sidecar updates for the selected application.
- Validated against application memory schema.
- Must preserve existing useful memory unless corrected.
- Malformed sidecar JSON falls back to the existing parsed application memory.
- If reusable profile facts or global preferences are discussed in Application Chat, the app creates a Profile Chat handoff instead of directly writing global profile memory.

General memory:

- General Chat does not write global profile facts.
- General Chat may create handoffs and deterministic action records.

## Source and Attachment Policy

Current state:

- Uploads are saved in `ProfileBank.rawSources`.
- Upload notices are appended into chat messages.

Target state:

- Sources are first-class rows.
- Sources have explicit scope: `profile`, `application`, or `general`.
- Chat messages can reference source IDs.
- Context builder retrieves relevant snippets, not whole files by default.
- Existing `ProfileBank.rawSources` remains readable during migration.

## Cost and Performance Policy

- Do not run every possible sidecar on every message.
- Use one main LLM call where practical.
- Run memory updates only for modes where memory can change.
- Run summaries only after thresholds.
- Use cheaper/smaller configured models for background summarization or extraction when suitable.
- Keep prompt/context budgets explicit.
- Cache stable job parsing and application summaries.

## Conversation Summaries and Retrieval

Implemented policy:

- `Conversation.summary` stores a concise rolling summary as JSON.
- `Conversation.lastSummarizedMessageId` records the latest older message folded into that summary.
- The main chat context uses recent messages first, then a rolling summary and relevant older messages when available.
- Relevant older-message retrieval is deterministic keyword matching scoped by `conversationId` and `userId`.
- Older-message retrieval runs only when the recent window is full.
- Summary generation is skipped below `CVHELP_CONVERSATION_SUMMARY_THRESHOLD`.
- Summary writes use scoped backend updates and preserve full raw chat messages.
- Model-assisted relevance selection is intentionally deferred until deterministic retrieval proves insufficient.

## Backwards Compatibility

Must preserve:

- Existing profile chat load/send behavior.
- Existing application chat load/send behavior.
- Existing `/api/applications` creation API until General Chat creation is fully tested.
- Existing application memory/artifact data.
- Existing `build_profile` mode in API payloads.
- Existing profile source display for old `rawSources`.

## Proposed File Layout

- `src/lib/chat/types.ts`
- `src/lib/chat/conversations.ts`
- `src/lib/chat/context.ts`
- `src/lib/chat/actions.ts`
- `src/lib/chat/handoffs.ts`
- `src/lib/chat/summaries.ts`
- `src/lib/ai/agents.ts`
- `src/lib/ai/models.ts`
- `src/lib/ai/json.ts`
- `src/lib/ai/memory-updates.ts`
- `src/lib/ai/cost-policy.ts`
- `src/lib/sources.ts`
- `src/lib/tools/application-actions.ts`

## Proposed Schema Changes

Near term:

- `Conversation.summary Json?`
- `Conversation.lastSummarizedMessageId String?`
- `ChatMessage.metadata Json?`

Source migration:

- `Source`
- `ChatMessageSource`

Avoid until justified:

- Normalized profile fact tables.
- Vector search tables.
- Multiple application subthreads beyond `threadKey` support.
