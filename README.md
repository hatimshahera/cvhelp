# CVhelp

CVhelp is a private, database-backed AI workspace for building a reusable career profile, managing job applications, and generating application artifacts. It supports email/password accounts through Auth.js and Prisma. OAuth provider wiring exists for later, but email/password is the MVP auth path.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run db:push
npm run dev
```

Set the required local values:

```env
DATABASE_URL="postgresql://..."
DATABASE_URL_UNPOOLED="postgresql://..."
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-a-long-random-secret"
OPENAI_API_KEY=""
OPENAI_MODEL="gpt-5-mini"
```

Generate a secret with:

```bash
openssl rand -base64 32
```

## Production auth requirements

For production, set these before enabling real users:

```env
DATABASE_URL="pooled Postgres connection string"
DATABASE_URL_UNPOOLED="direct Postgres connection string for migrations"
NEXTAUTH_URL="https://your-production-domain.com"
NEXTAUTH_SECRET="long random secret generated for production only"
```

Rules:

- `NEXTAUTH_URL` must be the final production origin, not localhost and not a preview URL.
- `NEXTAUTH_SECRET` must be a production-only random value, not reused from local development.
- Email/password signin only needs the database and Auth.js variables above.
- Google, GitHub, and LinkedIn stay disabled unless their full provider env var pairs are present.

## OAuth providers

The Google button enables automatically when these are present in `.env.local`:

```env
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
```

Use this callback URL in the Google provider dashboard:

```text
https://your-domain.com/api/auth/callback/google
```

For local testing, use:

```text
http://localhost:3000/api/auth/callback/google
```

Google setup:

- Create OAuth credentials in Google Cloud Console.
- Add the production and local callback URLs above as authorized redirect URIs.
- Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Vercel.

Also make sure `NEXTAUTH_URL` is the production site URL in Vercel, not the local URL.

GitHub and LinkedIn provider wiring is already present for later account linking/profile enrichment:

```env
GITHUB_ID=""
GITHUB_SECRET=""
LINKEDIN_CLIENT_ID=""
LINKEDIN_CLIENT_SECRET=""
```

## Current scope

- Public landing page with login/signup.
- Email/password account creation with hashed passwords.
- Protected `/app` workspace.
- Profile-builder chat with structured profile memory, uploads, corrections, source cards, and source deletion.
- Per-application workspaces with one chat thread per application.
- Application memory, status, next action, selected evidence, risks, gaps, and notes.
- Artifact generation, review, refinement, JSON download, ProofCV-compatible data, and TeX export.
- Billing route scaffolding and free-plan feature gates.

Run the local quality gate before commits:

```bash
npm run quality
```
