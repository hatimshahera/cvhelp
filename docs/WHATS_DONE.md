# What Has Been Done

This is the factual status of the app before the three-agent chat architecture refactor.

## Repository Shape

- `cvhelp/` contains the Vercel-style Next.js web app.
- `proofcv/` contains the local ProofCV data/rendering system.
- `cv-work/` contains CV source material, profile knowledge-base notes, and LaTeX CV files.

## CVhelp App

Done:

- Next.js app exists.
- Prisma is configured for Postgres.
- Auth.js is configured with Prisma adapter.
- Credentials provider is implemented.
- Optional Google, GitHub, and LinkedIn provider wiring exists.
- Signup API exists at `/api/signup`.
- Auth route exists at `/api/auth/[...nextauth]`.
- Landing page exists at `/`.
- Signin page exists at `/sign-in`.
- Signup page exists at `/sign-up`.
- Protected workspace page exists at `/app`.
- Shared app shell component exists.
- Vitest test suite exists.
- Production build passes.
- Typecheck passes.

## Current Data Model

Done:

- `User`
- `Account`
- `Session`
- `VerificationToken`
- `Conversation`
- `ChatMessage`
- `ProfileBank`
- `Application`
- `ApplicationArtifact`
- `Subscription`

Current `ProfileBank` fields:

- `masterProfile`
- `rawSources`
- `checklist`

Current `Application` fields:

- `company`
- `role`
- `slug`
- `status`
- `nextAction`
- `archivedAt`
- `jobPost`
- `jobSummary`
- `memory`
- `candidateSnapshot`
- `selectedEvidence`
- `notes`
- `drafts`

Current `ApplicationArtifact` fields:

- `type`
- `title`
- `status`
- `version`
- `content`
- `metadata`

## Current APIs

Done:

- `/api/signup`
- `/api/auth/[...nextauth]`
- `/api/chat`
- `/api/profile-sources`
- `/api/applications`

Current `/api/chat` behavior:

- Requires signed-in user.
- Supports `build_profile`, `application`, and `general` modes in API.
- Persists user and assistant messages.
- Uses OpenAI Responses API.
- Builds prompt context from recent messages, conversation summaries, scoped relevant older messages, profile bank, selected application, and attached source snippets.
- Keeps General Chat context-light by default: recent General Chat messages, summary, shared rules, and backend tool definitions only.
- Uses a deterministic General Chat context planner before loading application, profile, or source context.
- Uses bounded read-only workspace tools for explicit General Chat application/profile/source lookup requests.
- Updates profile raw sources/checklist from profile-builder messages.
- Updates `masterProfile` with a second AI call in profile-builder mode.
- Updates application-specific memory and notes after application chat turns.
- Preserves existing profile/application memory when sidecar model JSON is malformed or fails validation.
- Exposes General Chat in the UI.
- Creates applications from General Chat through deterministic backend code.
- Preflights General Chat job-source creation before calling the chat model.
- Returns short deterministic creation-blocked responses instead of generic tailoring content when application creation fails.
- Separates job-source creation intent from job-analysis intent, so pasted job descriptions with profile-fit questions stay in General Chat and retrieve profile context.
- Improves recruiter-style job metadata extraction for anonymized "The Company / The Role" posts.
- Creates explicit Profile Chat handoffs from General Chat.
- Creates explicit Profile Chat handoffs from Application Chat when the user asks to update reusable/global profile facts.
- Provides `POST /api/chat/actions` for deterministic platform actions.
- Supports confirmed archive, restore, status update, rename, and read-only comparison actions with ownership checks.
- Uses extracted agent, context, source, handoff, application-action, and memory-update helpers.
- Uses extracted General Chat context planning, workspace tool retrieval, and response-generation helpers.
- Lists multiple durable General Chat threads in the workspace rail.
- Creates a new General Chat thread when the user sends the first message from `New chat`.

Current `/api/profile-sources` behavior:

- Requires signed-in user.
- Accepts up to 6 files.
- Limits each file to 5 MB.
- Extracts text from text-like files.
- Attempts PDF text extraction.
- Saves uploaded source content as scoped `Source` rows.
- Preserves profile uploads in the profile bank for backwards-compatible source display.
- Updates checklist for CV, LinkedIn, and GitHub based on filenames for profile-scope uploads.

Current `/api/applications` behavior:

- Requires signed-in user.
- Lists current user's applications.
- Creates application from pasted job text or a readable URL.
- Infers company and role roughly from job text.
- Stores raw job post content and initial deterministic job summary data.
- Creates an application conversation.

Current artifact route behavior:

- `/api/applications/[id]/artifacts` lists and creates scoped artifacts.
- Artifact generation supports CV drafts, cover notes, recruiter messages, application answers, and ProofCV-compatible data.
- Artifact versions are stored under the correct application.
- Export/PDF routes exist for saved artifacts.

Current billing route behavior:

- `/api/billing/status` exists.
- `/api/billing/checkout` exists.
- `/api/billing/portal` exists.
- `/api/billing/webhook` exists.
- Feature gates exist for applications, uploads, generations, and exports.
- Temporary internal accounts can use `Subscription.plan = "internal"` for effectively unlimited limits.
- Stripe setup can remain incomplete locally while routes return controlled setup errors.

## Current UI

Done:

- Signed-in workspace has a left rail.
- Left rail is simplified to General Chat, Applications, and Profile Builder.
- User identity and logout are shown.
- Profile builder navigation exists.
- General Chat lists existing General Chat threads and a `New chat` action.
- Application list shows active applications directly.
- Archived applications are grouped under a collapsed archived section.
- General Chat navigation exists.
- Application creation is routed through General Chat.
- Profile bank summary panel exists.
- Chat area exists.
- File attach control exists.
- Clear profile conversation action exists.
- Application selection loads separate chat history.
- Application search and filter controls have been removed from the sidebar.
- Application side panel can show job post, artifacts, and CV PDF previews.
- Assistant action buttons can open a newly created application chat or continue in Profile Chat.
- Playwright browser smoke tests cover General Chat routing, Profile Chat handoff, application creation handoff, desktop layout, mobile layout, keyboard activation, overflow checks, and client console errors.
- Production smoke tests passed for auth, General Chat application creation, Profile Chat handoff, and switching into the created application chat.

## ProofCV Reference System

Done:

- `proofcv/profile/master_profile.json` stores canonical profile data.
- `proofcv/profile/project_bank.json` stores project evidence.
- `proofcv/applications/*/job_post.json` stores job post data.
- `proofcv/applications/*/cv_data.json` stores targeted application data.
- Some applications include `application_note.md`.
- PDF renderer service exists under `proofcv/services/pdf-renderer`.

ProofCV application data shape currently includes:

- candidate identity
- target company/role/fit
- selected projects
- selected research
- profile summary
- honesty notes

## Known Gaps

- The README and older docs may understate current implementation and need updating as part of architecture work.
- Application memory remains JSON-based and should be protected by stricter context and write boundaries.
- Source retrieval uses scoped source records but does not yet chunk large files independently.
- A fresh migration replay still needs a disposable Postgres shadow database URL.
- Secrets appear in local env files and should be treated carefully.
