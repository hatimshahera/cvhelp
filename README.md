# CVhelp

Fresh CVhelp app shell: Clerk authentication, Google/Apple sign-in entry points, protected chat workspace, and left-side settings/logout rail.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Fill `.env.local` with Clerk keys from the Clerk dashboard:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
CLERK_SECRET_KEY=sk_test_your_key_here
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/app
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/app
```

Enable Google and Apple sign-in inside Clerk's dashboard. Apple sign-in also requires Apple Developer configuration.

## Current scope

- Public landing page with login/signup.
- Clerk sign-in/sign-up pages.
- Protected `/app` route.
- Chat interface after login.
- Left settings rail with logout.

The chat is intentionally local UI state for now. Profile setup, CV upload, payments, and real generation should be added in later commits.
