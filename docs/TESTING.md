# CVhelp Testing

## Runner Choice

CVhelp uses Vitest for unit and API integration tests. This keeps the current suite fast while the app is still mostly route handlers, schema helpers, and server-side workflows.

Use:

```bash
npm test
npm run quality
```

`npm run quality` is the required local checkpoint before each phase commit. It runs TypeScript, Vitest, and the production Next.js build.

## Test Database Setup

Route tests currently mock Prisma for deterministic ownership, billing, chat, and artifact checks. Browser E2E should use an isolated Postgres database, not the development database.

Create a test database and point these variables at it:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/cvhelp_test?schema=public
DATABASE_URL_UNPOOLED=postgresql://USER:PASSWORD@HOST:PORT/cvhelp_test?schema=public
NEXTAUTH_SECRET=test-secret
NEXTAUTH_URL=http://localhost:3000
OPENAI_API_KEY=test-key
OPENAI_MODEL=gpt-5-mini
```

Then apply the schema:

```bash
npm run db:push
```

E2E tests should reset user-scoped records between scenarios and should never run against production credentials.

## Fixtures

Reusable fixtures live in `src/test/fixtures`:

- `cv.ts` has a realistic CV text sample and parsed profile target.
- `job-post.ts` has a realistic job description and extracted summary target.
- `application.ts` has a saved application record and application memory target.

Reusable mocked OpenAI helpers live in `src/test/openai.ts`.
