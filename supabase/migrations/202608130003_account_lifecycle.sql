-- Reject inactive and forced-password-change accounts below the UI.
-- Add audited coordinator account lifecycle operations.

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and active
  );
$$;

revoke all on function public.is_active_user() from public, anon;
grant execute on function public.is_active_user() to authenticated;

create or replace function public.is_operational_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and active and not must_change_password
  );
$$;

revoke all on function public.is_operational_user() from public, anon;
grant execute on function public.is_operational_user() to authenticated;

create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles
  where id = (select auth.uid()) and active and not must_change_password;
$$;

create or replace function public.search_building_directory(search_text text default '')
returns table (
  id uuid,
  code text,
  municipality_code char(5),
  municipality_name text,
  department_name text,
  name text,
  address_reference text,
  last_inspected_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id, b.code, b.municipality_code, m.name, m.department_name, b.name,
    b.address_reference, max(i.submitted_at)
  from public.buildings b
  join public.municipalities m on m.code = b.municipality_code
  left join public.inspections i on i.building_id = b.id and i.status = 'submitted'
  where public.is_operational_user()
    and (
      length(trim(coalesce(search_text, ''))) = 0
      or b.code ilike '%' || search_text || '%'
      or coalesce(b.name, '') ilike '%' || search_text || '%'
      or b.address_reference ilike '%' || search_text || '%'
    )
  group by b.id, m.name, m.department_name
  order by max(i.submitted_at) desc nulls last, b.code
  limit 50;
$$;

create or replace function public.reject_non_operational_account_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select auth.uid()) is not null and not public.is_operational_user() then
    raise exception 'operational account required';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger profiles_active_account_before_mutation
before insert or update or delete on public.profiles
for each row execute function public.reject_non_operational_account_mutation();
create trigger buildings_active_account_before_mutation
before insert or update or delete on public.buildings
for each row execute function public.reject_non_operational_account_mutation();
create trigger inspections_active_account_before_mutation
before insert or update or delete on public.inspections
for each row execute function public.reject_non_operational_account_mutation();
create trigger photos_active_account_before_mutation
before insert or update or delete on public.inspection_photos
for each row execute function public.reject_non_operational_account_mutation();
create trigger proposals_active_account_before_mutation
before insert or update or delete on public.building_change_proposals
for each row execute function public.reject_non_operational_account_mutation();
create trigger batches_active_account_before_mutation
before insert or update or delete on public.import_batches
for each row execute function public.reject_non_operational_account_mutation();

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (public.is_active_user() and ((select auth.uid()) = id or public.is_coordinator()));

drop policy if exists municipalities_select on public.municipalities;
create policy municipalities_select on public.municipalities for select to authenticated
  using (public.is_operational_user());

drop policy if exists buildings_coordinator_all on public.buildings;
create policy buildings_coordinator_all on public.buildings for all to authenticated
  using (public.is_operational_user() and public.is_coordinator())
  with check (public.is_operational_user() and public.is_coordinator());

drop policy if exists inspections_select on public.inspections;
create policy inspections_select on public.inspections for select to authenticated
  using (public.is_operational_user() and ((select auth.uid()) = inspector_id or public.is_coordinator()));
drop policy if exists inspections_insert_own on public.inspections;
create policy inspections_insert_own on public.inspections for insert to authenticated
  with check (public.is_operational_user() and (select auth.uid()) = inspector_id);

drop policy if exists photos_select on public.inspection_photos;
create policy photos_select on public.inspection_photos for select to authenticated
  using (public.is_operational_user() and (public.is_coordinator() or exists (
    select 1 from public.inspections i where i.id = inspection_id and i.inspector_id = (select auth.uid())
  )));
drop policy if exists photos_insert_own on public.inspection_photos;
create policy photos_insert_own on public.inspection_photos for insert to authenticated
  with check (public.is_operational_user() and created_by = (select auth.uid()) and exists (
    select 1 from public.inspections i where i.id = inspection_id and i.inspector_id = (select auth.uid())
  ));
drop policy if exists photos_coordinator_delete on public.inspection_photos;
create policy photos_coordinator_delete on public.inspection_photos for delete to authenticated
  using (public.is_operational_user() and public.is_coordinator());

drop policy if exists proposals_select on public.building_change_proposals;
create policy proposals_select on public.building_change_proposals for select to authenticated
  using (public.is_operational_user() and (proposed_by = (select auth.uid()) or public.is_coordinator()));
drop policy if exists proposals_insert on public.building_change_proposals;
create policy proposals_insert on public.building_change_proposals for insert to authenticated
  with check (public.is_operational_user() and proposed_by = (select auth.uid()));
drop policy if exists proposals_coordinator_update on public.building_change_proposals;
create policy proposals_coordinator_update on public.building_change_proposals for update to authenticated
  using (public.is_operational_user() and public.is_coordinator())
  with check (public.is_operational_user() and public.is_coordinator());

drop policy if exists batches_select on public.import_batches;
create policy batches_select on public.import_batches for select to authenticated
  using (public.is_operational_user() and (uploader_id = (select auth.uid()) or public.is_coordinator()));
drop policy if exists batches_insert on public.import_batches;
create policy batches_insert on public.import_batches for insert to authenticated
  with check (public.is_operational_user() and uploader_id = (select auth.uid()));

drop policy if exists revisions_coordinator_select on public.inspection_revisions;
create policy revisions_coordinator_select on public.inspection_revisions for select to authenticated
  using (public.is_operational_user() and public.is_coordinator());
drop policy if exists audit_coordinator_select on public.audit_events;
create policy audit_coordinator_select on public.audit_events for select to authenticated
  using (public.is_operational_user() and public.is_coordinator());

drop policy if exists inspection_photo_objects_select on storage.objects;
create policy inspection_photo_objects_select on storage.objects for select to authenticated
using (
  public.is_operational_user()
  and bucket_id = 'inspection-photos'
  and exists (
    select 1 from public.inspections i
    where i.id::text = (storage.foldername(name))[1]
      and (i.inspector_id = (select auth.uid()) or public.is_coordinator())
  )
);
drop policy if exists inspection_photo_objects_insert on storage.objects;
create policy inspection_photo_objects_insert on storage.objects for insert to authenticated
with check (
  public.is_operational_user()
  and bucket_id = 'inspection-photos'
  and exists (
    select 1 from public.inspections i
    where i.id::text = (storage.foldername(name))[1]
      and i.inspector_id = (select auth.uid())
  )
);
drop policy if exists inspection_photo_objects_delete on storage.objects;
create policy inspection_photo_objects_delete on storage.objects for delete to authenticated
using (public.is_operational_user() and bucket_id = 'inspection-photos' and public.is_coordinator());

create or replace function public.manage_account_lifecycle(
  target_user_id uuid,
  requested_action text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.app_role;
  target_profile public.profiles;
  audit_type text;
begin
  actor_role := public.current_role();
  if coalesce(actor_role::text, '') not in ('coordinator', 'super_admin') then
    raise exception 'coordinator role required';
  end if;
  if target_user_id = (select auth.uid()) then
    raise exception 'self-management is not allowed';
  end if;

  select * into target_profile from public.profiles where id = target_user_id for update;
  if not found then raise exception 'target profile not found'; end if;
  if actor_role = 'coordinator' and target_profile.role <> 'inspector' then
    raise exception 'coordinators may manage inspectors only';
  end if;
  if actor_role = 'super_admin' and target_profile.role = 'super_admin' then
    raise exception 'super-administrator accounts require institutional recovery';
  end if;

  case requested_action
    when 'deactivate' then
      if not target_profile.active then raise exception 'account already inactive'; end if;
      update public.profiles set active = false, must_change_password = true where id = target_user_id;
      audit_type := 'account.deactivated';
    when 'reactivate' then
      if target_profile.active then raise exception 'account already active'; end if;
      update public.profiles set active = true, must_change_password = true where id = target_user_id;
      audit_type := 'account.reactivated';
    when 'reset_password' then
      if not target_profile.active then raise exception 'inactive account cannot receive a password reset'; end if;
      update public.profiles set must_change_password = true where id = target_user_id;
      audit_type := 'account.password_reset';
    else
      raise exception 'invalid account action';
  end case;

  insert into public.audit_events (actor_id, event_type, entity_type, entity_id, metadata)
  values (
    (select auth.uid()), audit_type, 'profile', target_user_id,
    jsonb_build_object('target_role', target_profile.role, 'requires_password_change', true)
  );
end;
$$;

revoke all on function public.manage_account_lifecycle(uuid, text) from public, anon;
grant execute on function public.manage_account_lifecycle(uuid, text) to authenticated;

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and coalesce(qual, '') || coalesce(with_check, '') not like '%is_active_user%'
  ) then
    raise exception 'the profile policy must reject inactive accounts';
  end if;

  if exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in (
        'municipalities', 'buildings', 'inspections',
        'inspection_photos', 'building_change_proposals', 'import_batches',
        'inspection_revisions', 'audit_events'
      )
      and coalesce(qual, '') || coalesce(with_check, '') not like '%is_operational_user%'
  ) then
    raise exception 'every operational policy must reject restricted accounts';
  end if;

  if exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'inspection_photo_objects_%'
      and coalesce(qual, '') || coalesce(with_check, '') not like '%is_operational_user%'
  ) then
    raise exception 'every inspection photo policy must reject restricted accounts';
  end if;
end;
$$;
