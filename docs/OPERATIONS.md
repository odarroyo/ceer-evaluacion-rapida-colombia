# Operations runbook

## Daily checks

- Confirm `/api/health` reports the expected version, mode, backend, database,
  and municipality count.
- Review Vercel error/latency and Supabase Auth, Database, and Storage usage.
- Review failed backups, rejected imports, pending proposals, and records marked
  for review without copying sensitive payloads into tickets or chat.
- Confirm inactive-account, unusual-authentication, capacity, and spending alerts
  reach the named primary and secondary responders.

## Account operations

Coordinators create inspectors, list accounts, deactivate/reactivate access, and
issue replacement temporary passwords from the account screen. Every lifecycle
change sets `must_change_password`, writes an audit event, and is enforced at the
application, database, RPC, and Storage layers. Temporary passwords are displayed
once and belong only in the institution-approved secure handoff channel.

## Independent encrypted photo backup

Generate and retain a 32-byte key in the approved secrets manager. An independent
worker runs `npm run photos:backup` daily with an explicit durable/versioned
`PHOTO_BACKUP_DIRECTORY`. Quarterly, restore a sample to a new isolated path with
`npm run photos:restore`, record counts and hashes only, and never overwrite an
existing restore.

An incomplete backup directory without `manifest.ceerenc` is not restorable
evidence. Production key custody, schedule, retention, and failure alerts must be
approved before launch.

## Interrupted submissions and incidents

The client retry UUID makes a repeated submission return the original receipt.
Do not create a manual replacement until coordination confirms the original is
absent.

For an incident: identify the release/time window and opaque record IDs; contain
access; preserve logs and audit records; notify the institutional channel;
correct records only through audited functions; rotate affected secrets; and
repeat relevant acceptance gates. Never delete suspected evidence.

No automatic record or photo deletion is configured. Add retention automation
only after an approved policy and a reviewed forward migration define legal
basis, backups, tests, and rollback.
