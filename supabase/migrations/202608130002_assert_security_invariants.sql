-- Fail deployment if the baseline access-control guarantees are missing.
-- These assertions are data-independent, so they also run safely before the seed.
do $$
declare
  table_name text;
  required_tables constant text[] := array[
    'profiles',
    'municipalities',
    'buildings',
    'inspections',
    'inspection_photos',
    'building_change_proposals',
    'import_batches',
    'inspection_revisions',
    'audit_events'
  ];
begin
  foreach table_name in array required_tables loop
    if not exists (
      select 1
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = table_name
        and c.relkind = 'r'
        and c.relrowsecurity
    ) then
      raise exception 'required table public.% is missing or does not have RLS enabled', table_name;
    end if;
  end loop;

  if has_table_privilege('authenticated', 'public.profiles', 'UPDATE') then
    raise exception 'authenticated must not have direct UPDATE privilege on public.profiles';
  end if;

  if not exists (
    select 1
    from storage.buckets
    where id = 'inspection-photos'
      and public = false
      and file_size_limit = 12582912
      and allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp']::text[]
  ) then
    raise exception 'inspection-photos bucket is missing or is not private/restricted';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'inspection_photo_objects_select',
        'inspection_photo_objects_insert',
        'inspection_photo_objects_delete'
      )
  ) <> 3 then
    raise exception 'required inspection photo storage policies are missing';
  end if;
end;
$$;
