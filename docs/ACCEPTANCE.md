# Acceptance and release gates

Record evidence outside the public repository unless it is fully synthetic,
redacted, and explicitly approved for publication. Never record credentials,
tokens, account identities, contacts, coordinates, photo paths/content, or real
inspection data.

## Clean-clone gate

- [ ] Fresh allowlisted clone contains no ignored/private artifacts.
- [ ] Full-history secret scan passes.
- [ ] `npm ci --legacy-peer-deps` passes.
- [ ] No ATC-derived form or downloadable template exists in the clean clone.
- [ ] Lint, TypeScript, unit tests, and production build pass.
- [ ] `supabase db reset` and `supabase test db` pass.
- [ ] GitHub `secrets`, `application`, and `database` jobs pass.

## Persistent synthetic staging

- [ ] `/api/health` reports `staging`, Supabase, and 1,122 municipalities.
- [ ] Public signup is disabled and Auth URLs match the HTTPS deployment.
- [ ] iPhone Safari and Android Chrome pass GPS accepted/rejected/manual paths.
- [ ] Five compressed photos persist privately with no EXIF metadata.
- [ ] Unrestricted, conditioned-access, and no-entry result paths pass.
- [ ] Interrupted submission retry produces exactly one receipt.
- [ ] Inspector/coordinator isolation passes in UI, PostgreSQL, and Storage.
- [ ] Valid/invalid XLSX and accented export pass atomically.
- [ ] Account deactivation, reactivation, and replacement-password handoff pass.
- [ ] 200 authenticated page requests, 100 concurrent submissions, and 50
      concurrent five-photo submissions meet agreed thresholds.

## Real 200-user pilot

- [ ] Institution-owned Vercel Pro and Supabase Pro organizations have two owners,
      MFA, billing, primary/secondary responders, and São Paulo regions.
- [ ] Clean production projects receive migrations and DIVIPOLA seed only.
- [ ] A 200-account synthetic roster and secure credential handoff are verified.
- [ ] Managed database backup and independent encrypted photo restore are tested.
- [ ] Health, error, capacity, security, and spending alerts reach responders.
- [ ] Custom-domain TLS, rollback ownership, retention approval, and final smoke pass.
- [ ] Hosting, data processing, retention, branding, and operational ownership are
      approved before any real field record is accepted.

Release decision:

Reviewed commit:

Environment and URL:

Responsible maintainer and date (stored in the approved operational record):
