# Security and privacy model

Browser input is untrusted. Server validation, database constraints, immutable
snapshots, and private Storage enforce the workflow. Inspector identity and
affiliation come from the authenticated profile, never request or workbook data.

| Resource | Inspector | Coordinator / super-admin |
|---|---|---|
| Own inspections/photos | Read/create | Read |
| Other inspectors' records | No | Read |
| Sanitized building directory | Read through RPC | Read |
| Corrections/voiding | No | Audited functions |
| Building proposals | Create/read own | Review all |
| Accounts | No | List/manage permitted subordinate roles |
| Audit/revision history | No | Read |

Inactive profiles are denied by profile loading, every application-table policy,
mutation guards, security-definer read paths, and private-photo policies. Provider
bans supplement this database boundary; they are not the only control.

Profiles awaiting a mandatory password replacement may read only their own
profile. Operational APIs, tables, RPCs, and photo objects remain unavailable
until the replacement succeeds and the server clears `must_change_password`.

Public signup is disabled. Temporary passwords are cryptographically random,
single-display, and force a replacement of at least 12 characters. Server secrets
never use `NEXT_PUBLIC_` and belong only in Vercel/Supabase secret stores.

Logs may contain event names, opaque UUIDs, receipt codes, counts, roles, provider
error codes, and timing. They must not contain contacts, addresses, exact
coordinates, conditions, snapshots, photo paths/content, credentials, or
temporary passwords.

Deployment branding is configurable, but institutional marks require separate
written authorization. Operator identity never changes authorship or implies
endorsement. Fixed CEER, original-repository, and Applied Technology Council
credits remain visible under `ATTRIBUTION.md`.
