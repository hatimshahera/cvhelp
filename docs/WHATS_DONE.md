# What Has Been Done

This is the factual status of the app at the start of the planning phase.

## Repository Shape

- `cvhelp/` contains the Vercel-style Next.js web app.
- `proofcv/` contains the local ProofCV data/rendering system.
- `cv-work/` contains CV source material, profile knowledge-base notes, and LaTeX CV files.

## CVhelp App

Done:

- Next.js app exists.
- Vercel project link exists in `.vercel/project.json`.
- Prisma is configured for Postgres.
- Neon/Postgres env vars exist locally.
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
- Production build passes.
- Typecheck passes.
- Prisma migrate status reports database schema is up to date.

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

Current `ProfileBank` fields:

- `masterProfile`
- `rawSources`
- `checklist`

Current `Application` fields:

- `company`
- `role`
- `slug`
- `status`
- `jobPost`
- `jobSummary`
- `notes`
- `drafts`

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
- Builds prompt context from recent messages, profile bank, and selected application.
- Updates profile raw sources/checklist from profile-builder messages.
- Updates `masterProfile` with a second AI call in profile-builder mode.
- Adds application chat summaries into application notes.

Current `/api/profile-sources` behavior:

- Requires signed-in user.
- Accepts up to 6 files.
- Limits each file to 5 MB.
- Extracts text from text-like files.
- Attempts PDF text extraction.
- Saves uploaded source content to the profile bank.
- Updates checklist for CV, LinkedIn, and GitHub based on filenames.

Current `/api/applications` behavior:

- Requires signed-in user.
- Lists current user's applications.
- Creates application from pasted job text or a readable URL.
- Infers company and role roughly from job text.
- Stores raw job post content and initial summary placeholders.
- Creates an application conversation.

## Current UI

Done:

- Signed-in workspace has a left rail.
- User identity and logout are shown.
- Profile builder navigation exists.
- Application list exists.
- Application creation form exists.
- Profile bank summary panel exists.
- Chat area exists.
- File attach control exists.
- Clear profile conversation action exists.
- Application selection loads separate chat history.

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

- The README understates current implementation and needs updating later.
- Application memory is still too loose and mostly JSON/blob based.
- Application chat exists, but richer per-application artifacts are not yet modeled.
- No generated CV/export route exists in the web app.
- No payment/billing routes exist yet.
- No Stripe integration exists yet.
- No automated test suite is configured beyond typecheck/build.
- No end-to-end tests exist.
- No production smoke test has been performed in this planning pass.
- UI is functional but not yet polished into a full product workspace.
- Secrets appear in local env files and should be treated carefully.

