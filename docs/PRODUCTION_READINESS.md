# Production Readiness

Status from the Phase 10 pass on August 18, 2026.

## Deployment

- Production alias: `https://cvhelp.vercel.app`
- Latest inspected deployment: `https://cvhelp-2xclx31or-hatimshahera-6608s-projects.vercel.app`
- Vercel status: Ready
- `/` returns 200 on the production alias.
- `/app` redirects signed-out users to `/sign-in` on the production alias.

## Environment

Confirmed present in Vercel production:

- `DATABASE_URL`
- `DATABASE_URL_UNPOOLED`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `OPENAI_API_KEY`

`OPENAI_MODEL` is not configured in Vercel. The app intentionally falls back to `gpt-5-mini` through `getOpenAIModel`.

## Database

- `prisma migrate deploy` applied:
  - `20260818140000_add_chat_message_metadata`
  - `20260818143000_add_scoped_sources`
  - `20260818150000_add_conversation_summaries`
- `prisma migrate status` reports the configured database is up to date.
- Schema SQL generation from an empty baseline succeeds.
- A full fresh migration replay still needs a disposable Postgres shadow database URL. Do not use production as a shadow database.

## Smoke Tests

Local production-bundle checks passed:

- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run test:e2e`

Production checks passed:

- `npm run test:e2e:prod`
- Real production chat smoke with `CVHELP_E2E_REAL_CHAT=1`, covering:
  - auth/signup/sign-in
  - General Chat application creation
  - opening the new application chat
  - General Chat Profile Chat handoff
  - opening Profile Chat with handoff context

The real production smoke creates a throwaway user and deletes it through Prisma cleanup after the test.
