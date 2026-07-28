# CVhelp

Fresh CVhelp app shell with owned, database-backed authentication through Auth.js and Prisma. The app supports email/password accounts locally and can enable Google, GitHub, and LinkedIn as provider integrations through environment variables.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run db:push
npm run dev
```

Set the required local values:

```env
DATABASE_URL="file:./dev.db"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-a-long-random-secret"
```

Generate a secret with:

```bash
openssl rand -base64 32
```

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
- Custom sign-in/sign-up pages.
- Email/password account creation with hashed passwords.
- Optional Google sign-in provider.
- Protected `/app` route.
- Chat interface after login.
- Left settings rail with logout.

The chat is intentionally local UI state for now. Profile setup, CV upload, payments, and real generation should be added in later commits.
