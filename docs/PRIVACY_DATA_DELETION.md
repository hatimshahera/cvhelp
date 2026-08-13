# Privacy and Data Deletion Plan

## Data Stored

CVhelp stores private career and application data scoped to the signed-in user:

- Account identity: email, display name, password hash, auth sessions.
- Profile memory: structured profile facts, raw sources, checklist status.
- Application memory: company, role, job post, summaries, selected evidence, notes, drafts, status, and generated artifacts.
- Chat memory: user and assistant messages scoped to profile chat or one application thread.
- Billing state: plan, provider customer ID, subscription ID, status, period end, and trial dates.

The app should not store raw payment card data. Stripe owns card/payment collection when billing is enabled.

## User Controls

Minimum user-facing controls before beta:

- Clear a profile or application chat thread.
- Delete individual profile sources.
- Edit or remove saved profile facts.
- Archive applications.
- Delete generated artifacts.
- Request full account deletion by support/admin process.

Future self-serve controls:

- Export profile and application data as JSON.
- Delete one application and all related chats/artifacts.
- Delete the full account and all owned records from account settings.

## Deletion Semantics

The Prisma schema uses cascading relations from `User` to private records. Full account deletion should delete:

- Auth accounts and sessions.
- Conversations and chat messages.
- Profile bank.
- Applications and application artifacts.
- Subscription row in CVhelp.

Stripe customer/subscription deletion or cancellation should be handled through Stripe APIs and webhook reconciliation when Stripe is connected.

## Retention

Suggested beta defaults:

- Keep user-owned profile, application, chat, and artifact data until the user deletes it or requests account deletion.
- Keep server logs short-lived and scrubbed of CV text, chat content, job descriptions, and generated artifacts.
- Keep billing identifiers while the account exists and for any required financial/legal retention handled by Stripe.

## Operational Requirements

Before public launch:

- Add an admin/support checklist for verifying the requester owns the email account.
- Add a server action or API route for full account deletion with re-authentication.
- Add audit-safe logs that record deletion IDs/counts without content.
- Add production backup and restore policy.
- Document support response time for deletion requests.
