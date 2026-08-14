# Persistent synthetic staging

Staging is a free, persistent Vercel/Supabase environment for synthetic testing
only. It never becomes production, and no staging users, inspections, photos, or
evidence are migrated into the real pilot.

## Supabase

1. Create a Free project in São Paulo and store its database password in an
   approved password manager.
2. Disable public signup and configure exact site/redirect URLs for the assigned
   Vercel HTTPS address.
3. Link the pinned CLI without committing the generated `supabase/.temp` state:

   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR_STAGING_PROJECT_REF
   npm run staging:db:dry-run
   npm run staging:db:push
   npm run staging:config:push
   ```

4. Set the URL, publishable key, and server secret only in ignored local files
   and Vercel's encrypted environment settings.
5. Bootstrap only synthetic accounts. Temporary passwords are single-display and
   must use a secure handoff channel.

## Vercel Hobby

Connect the canonical repository, deploy `main`, and set
`NEXT_PUBLIC_CEER_ENV=staging` plus the complete Supabase and operator-branding
values. External-fork previews require manual authorization and receive no
staging secrets by default.

After deployment, verify `/api/health`, then complete every persistent-staging
item in `ACCEPTANCE.md` on the HTTPS URL. `npm run dev:mobile:tunnel` remains an
optional local diagnostic path; it is not the normal staging endpoint.

If the project is transferred to an institutional Vercel team, re-establish
monitoring, alert recipients, access reviews, and log-history expectations.
