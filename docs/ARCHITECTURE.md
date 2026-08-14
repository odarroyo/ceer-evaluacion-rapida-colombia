# Architecture and data boundaries

The browser captures a rapid inspection and sends untrusted input to Next.js.
Server handlers validate the request, derive inspector identity from Supabase
Auth, and persist snapshots through PostgreSQL and private Supabase Storage.

| Boundary | Data allowed across it | Enforcement |
|---|---|---|
| Browser → Next.js | Form values, client retry UUID, up to five compressed photos | Zod, size/type limits, server classification |
| Next.js → PostgreSQL | Authenticated profile ID and validated snapshots | Database constraints, immutable records, RLS |
| Next.js → Storage | Private photo objects under inspection IDs | Private bucket, MIME/size limits, Storage RLS |
| Coordinator → account provider | Create, ban/unban, replacement temporary password | Role check, database RPC, audit event, one-time response |
| Backup worker → durable storage | AES-256-GCM envelopes and encrypted manifest | Independent key, SHA-256 verification, no overwrite |

Inspectors can read only their own inspections and photos. Coordinators can read
team records and use audited correction, voiding, proposal-review, and account
lifecycle operations. Inactive profiles are rejected by application profile
loading, database policies, mutation guards, RPCs, and Storage policies.
Profiles awaiting mandatory password replacement are restricted to the password
change flow by the same operational database and application boundary.

Staging and production are independent security and data boundaries. Only
versioned migrations and the DIVIPOLA seed move between them. Users, inspection
records, photographs, synthetic evidence, and provider credentials never do.
