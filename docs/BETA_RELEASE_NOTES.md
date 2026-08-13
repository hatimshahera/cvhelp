# CVhelp Beta Release Notes

## Current Beta Scope

CVhelp is a private AI workspace for building a reusable career profile and managing job-specific applications.

Included:

- Email/password signup and signin.
- Protected workspace and private API routes.
- Profile-builder chat with saved profile memory, source cards, checklist, correction, and deletion flows.
- Text/PDF profile source upload with upload limits and file protections.
- Application creation from pasted descriptions and job URLs.
- One default chat thread per application.
- Application memory for job requirements, matched evidence, gaps, risks, notes, next actions, and selected evidence.
- Artifact generation routes for ProofCV data, CV drafts, cover notes, recruiter messages, and application answers.
- Artifact versioning, refinement, review, and export routes.
- Billing route placeholders and feature gates ready for Stripe connection.
- Local quality gate with typecheck, route/unit tests, and production build.

## Known Limitations

- Stripe checkout, portal, and webhook behavior need real Stripe credentials and product/price IDs before billing can be used in production.
- Production Vercel environment variables and migrations still need to be confirmed.
- Browser E2E tests are not yet installed.
- Password reset email is not implemented.
- OAuth is intentionally deferred.
- Full self-serve account deletion is planned but not implemented yet.

## Beta Entry Checklist

- Confirm production database URLs.
- Set `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `OPENAI_API_KEY`, and `OPENAI_MODEL`.
- Connect Stripe or keep billing routes disabled from the visible UI.
- Run production migrations.
- Run production smoke tests for auth, profile chat, application chat, and billing status.
- Review privacy/data deletion process.

## Support Notes

For beta testers, ask them to start with:

1. Sign up with email/password.
2. Upload or paste a CV.
3. Answer profile-builder questions until the profile review panel has enough evidence.
4. Create one job application from a pasted job description.
5. Use the application chat to select evidence and generate one CV draft.
