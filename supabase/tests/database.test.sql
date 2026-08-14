begin;
select plan(21);

select is(
  public.classify_rapid_conditions('{"conditions":{"cond_0":"menor","cond_1":"menor","cond_2":"menor","cond_3":"menor","cond_4":"menor","cond_5":"menor"}}'::jsonb)::text,
  'habitable',
  'all minor conditions classify as habitable'
);
select is(
  public.classify_rapid_conditions('{"conditions":{"cond_0":"no_evaluado","cond_1":"moderado","cond_2":"menor","cond_3":"menor","cond_4":"menor","cond_5":"menor"}}'::jsonb)::text,
  'uso_restringido',
  'moderate governs and no_evaluado is excluded'
);
select is(
  public.classify_rapid_conditions('{"conditions":{"cond_0":"moderado","cond_1":"severo","cond_2":"menor","cond_3":"menor","cond_4":"menor","cond_5":"menor"}}'::jsonb)::text,
  'peligro_colapso',
  'severe governs over moderate'
);

select ok(relrowsecurity, 'profiles RLS enabled') from pg_class where oid = 'public.profiles'::regclass;
select ok(relrowsecurity, 'municipalities RLS enabled') from pg_class where oid = 'public.municipalities'::regclass;
select ok(relrowsecurity, 'buildings RLS enabled') from pg_class where oid = 'public.buildings'::regclass;
select ok(relrowsecurity, 'inspections RLS enabled') from pg_class where oid = 'public.inspections'::regclass;
select ok(relrowsecurity, 'photos RLS enabled') from pg_class where oid = 'public.inspection_photos'::regclass;
select ok(relrowsecurity, 'building proposals RLS enabled') from pg_class where oid = 'public.building_change_proposals'::regclass;
select ok(relrowsecurity, 'import batches RLS enabled') from pg_class where oid = 'public.import_batches'::regclass;
select ok(relrowsecurity, 'inspection revisions RLS enabled') from pg_class where oid = 'public.inspection_revisions'::regclass;
select ok(relrowsecurity, 'audit events RLS enabled') from pg_class where oid = 'public.audit_events'::regclass;
select ok(not public.is_coordinator(), 'unauthenticated caller is not a coordinator');
select ok(not public.is_active_user(), 'unauthenticated caller is not an active user');
select ok(not public.is_operational_user(), 'unauthenticated caller is not an operational user');
select ok(not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'), 'authenticated users cannot bypass forced password change by updating profiles');
select ok(has_function_privilege('authenticated', 'public.manage_account_lifecycle(uuid,text)', 'EXECUTE'), 'authenticated coordinators can call the audited account lifecycle RPC');
select is(
  (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and coalesce(qual, '') || coalesce(with_check, '') not like '%is_active_user%'
  ),
  0::bigint,
  'the profile policy rejects inactive accounts'
);
select is(
  (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname in ('public', 'storage')
      and (
        (schemaname = 'public' and tablename <> 'profiles')
        or policyname like 'inspection_photo_objects_%'
      )
      and coalesce(qual, '') || coalesce(with_check, '') not like '%is_operational_user%'
  ),
  0::bigint,
  'operational policies reject inactive and forced-password-change accounts'
);
select is((select count(*) from public.municipalities), 1122::bigint, 'all DIVIPOLA municipalities are seeded');
select ok((select not public from storage.buckets where id = 'inspection-photos'), 'inspection photo bucket is private');

select * from finish();
rollback;
