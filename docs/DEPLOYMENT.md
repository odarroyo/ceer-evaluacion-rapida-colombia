# Institutional pilot deployment

The production pilot uses clean institution-controlled Vercel Pro and Supabase
Pro organizations. Budget 5–10 engineering days after accounts, rights approval,
domain, billing, and operational owners are available; review and procurement
may extend the calendar.

## Foundation

- At least two owners per provider, MFA, institutional billing, named primary and
  secondary responders, and São Paulo regions.
- Agency-controlled domain and an approved branding package kept outside Git.
- Exact Auth URLs, disabled public signup, SSL/network restrictions, and Supabase
  security/performance adviser review.
- Production keys only in provider secret stores. Rotate all keys at handoff.

Apply versioned migrations and `supabase/seed.sql` to a clean database. Never
copy staging users, records, photos, or evidence. Set in Vercel:

- `NEXT_PUBLIC_CEER_ENV=production`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` (server only)
- the three authorized `NEXT_PUBLIC_OPERATOR_*` values
- approved monitoring and backup integration secrets

Bootstrap institutional coordinators, then provision 200 inspectors through the
roster flow. Distribute single-display temporary passwords through the approved
secure channel. Verify deactivation/reactivation and replacement passwords before
field use.

## Recovery and operations

Enable Supabase managed database backups and run a daily independent encrypted
photo backup from an agency-controlled worker to durable versioned storage.
Complete a restore test before accepting real records. Configure health, errors,
capacity, spending, security alerts, incident contacts, rollback ownership, and
the approved retention policy.

For application defects, roll back the Vercel deployment. Do not destructively
reverse database migrations; use a reviewed forward corrective migration while
preserving inspections, revisions, imports, and audit events.
