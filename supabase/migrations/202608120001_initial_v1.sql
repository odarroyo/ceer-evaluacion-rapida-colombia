-- rapid_ceer_v1 / schema_version 1
-- Immutable inspection snapshots, least-privilege RLS, audited coordinator changes.

create extension if not exists pgcrypto;

create type public.app_role as enum ('inspector', 'coordinator', 'super_admin');
create type public.condition_rating as enum ('menor', 'moderado', 'severo', 'no_evaluado');
create type public.inspection_tag as enum ('habitable', 'uso_restringido', 'peligro_colapso');
create type public.inspection_scope as enum ('exterior', 'ext_int');
create type public.inspection_source as enum ('web', 'excel');
create type public.form_type as enum ('rapid_ceer', 'detailed_ceer');
create type public.inspection_status as enum ('submitted', 'void');
create type public.proposal_status as enum ('pending', 'approved', 'rejected');
create type public.import_status as enum ('validating', 'rejected', 'imported');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  email text not null,
  full_name text not null,
  affiliation text not null,
  role public.app_role not null default 'inspector',
  must_change_password boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.municipalities (
  code char(5) primary key check (code ~ '^\\d{5}$'),
  department_code char(2) not null check (department_code ~ '^\\d{2}$'),
  department_name text not null,
  name text not null,
  source_year integer not null,
  unique (department_code, name)
);

create sequence public.building_code_seq;

create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('ED-' || lpad(nextval('public.building_code_seq')::text, 8, '0')),
  municipality_code char(5) not null references public.municipalities(code),
  name text,
  address_reference text not null,
  contact text,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  gps_accuracy_m double precision check (gps_accuracy_m > 0),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null))
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  uploader_id uuid not null references public.profiles(id),
  filename text not null,
  workbook_version text not null,
  schema_version integer not null,
  status public.import_status not null default 'validating',
  row_count integer not null default 0 check (row_count between 0 and 1000),
  imported_count integer not null default 0,
  validation_report jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.inspections (
  id uuid primary key default gen_random_uuid(),
  receipt_code text not null unique check (receipt_code ~ '^CEER-[0-9]{8}-[A-Z0-9]{6,}$'),
  client_submission_id uuid not null,
  building_id uuid not null references public.buildings(id),
  inspector_id uuid not null references public.profiles(id),
  import_batch_id uuid references public.import_batches(id),
  source public.inspection_source not null,
  form_type public.form_type not null,
  schema_version integer not null check (schema_version > 0),
  inspection_scope public.inspection_scope not null,
  municipality_code char(5) not null references public.municipalities(code),
  address_reference text not null,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  gps_accuracy_m double precision check (gps_accuracy_m > 0),
  questionnaire_snapshot jsonb not null,
  suggested_tag public.inspection_tag not null,
  confirmed_tag public.inspection_tag not null,
  override_reason text,
  restrictions text,
  has_unassessed_warning boolean not null default false,
  needs_review boolean not null default false,
  duplicate_fingerprint text not null,
  status public.inspection_status not null default 'submitted',
  field_inspected_at timestamptz,
  submitted_at timestamptz not null default now(),
  corrected_at timestamptz,
  corrected_by uuid references public.profiles(id),
  voided_at timestamptz,
  voided_by uuid references public.profiles(id),
  void_reason text,
  check ((latitude is null) = (longitude is null)),
  check (address_reference <> '' or latitude is not null),
  check (suggested_tag = confirmed_tag or length(trim(coalesce(override_reason, ''))) > 0),
  check (confirmed_tag = 'habitable' or length(trim(coalesce(restrictions, ''))) > 0),
  unique (inspector_id, client_submission_id)
);

create unique index inspections_exact_duplicate_idx
  on public.inspections (inspector_id, duplicate_fingerprint)
  where status = 'submitted';
create index inspections_building_submitted_idx on public.inspections (building_id, submitted_at desc);
create index inspections_municipality_tag_idx on public.inspections (municipality_code, confirmed_tag);
create index inspections_inspector_submitted_idx on public.inspections (inspector_id, submitted_at desc);

create table public.inspection_photos (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete restrict,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 12582912),
  width integer not null check (width between 1 and 2048),
  height integer not null check (height between 1 and 2048),
  sha256 text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index inspection_photos_inspection_idx on public.inspection_photos (inspection_id);

create table public.building_change_proposals (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id),
  proposed_by uuid not null references public.profiles(id),
  proposed_changes jsonb not null,
  reason text not null,
  status public.proposal_status not null default 'pending',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);

create table public.inspection_revisions (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id),
  revision_number integer not null,
  previous_snapshot jsonb not null,
  replacement_snapshot jsonb,
  changed_fields jsonb not null,
  reason text not null,
  revised_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (inspection_id, revision_number)
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index audit_events_entity_idx on public.audit_events (entity_type, entity_id, occurred_at desc);

create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = (select auth.uid()) and active;
$$;

create or replace function public.is_coordinator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() in ('coordinator', 'super_admin'), false);
$$;

create or replace function public.classify_rapid_conditions(snapshot jsonb)
returns public.inspection_tag
language sql
immutable
set search_path = public
as $$
  select case
    when exists (
      select 1 from jsonb_each_text(snapshot -> 'conditions') c where c.value = 'severo'
    ) then 'peligro_colapso'::public.inspection_tag
    when exists (
      select 1 from jsonb_each_text(snapshot -> 'conditions') c where c.value = 'moderado'
    ) then 'uso_restringido'::public.inspection_tag
    else 'habitable'::public.inspection_tag
  end;
$$;

create or replace function public.validate_rapid_inspection()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  condition_count integer;
  evaluated_count integer;
begin
  if new.form_type = 'rapid_ceer' then
    select count(*), count(*) filter (where value <> 'no_evaluado')
      into condition_count, evaluated_count
      from jsonb_each_text(new.questionnaire_snapshot -> 'conditions');

    if condition_count <> 6 then
      raise exception 'rapid_ceer requires exactly six conditions';
    end if;
    if evaluated_count = 0 then
      raise exception 'all rapid conditions cannot be no_evaluado';
    end if;

    new.suggested_tag := public.classify_rapid_conditions(new.questionnaire_snapshot);
    new.has_unassessed_warning := evaluated_count < 6;
  end if;
  return new;
end;
$$;

create trigger inspections_validate_before_insert
before insert on public.inspections
for each row execute function public.validate_rapid_inspection();

create or replace function public.protect_inspection_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('app.coordinator_correction', true) <> 'on' then
    raise exception 'submitted inspections are immutable; use coordinator correction functions';
  end if;
  return new;
end;
$$;

create trigger inspections_immutable_before_update
before update on public.inspections
for each row execute function public.protect_inspection_snapshot();

create or replace function public.protect_profile_authorization()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.role, new.active) is distinct from (old.role, old.active)
     and not public.is_coordinator() then
    raise exception 'only coordinators may change role or active status';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_authorization_before_update
before update on public.profiles
for each row execute function public.protect_profile_authorization();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, affiliation, role, must_change_password)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email, 'Usuario'),
    coalesce(new.raw_user_meta_data ->> 'affiliation', 'Institución usuaria'),
    coalesce((new.raw_user_meta_data ->> 'role')::public.app_role, 'inspector'),
    coalesce((new.raw_user_meta_data ->> 'must_change_password')::boolean, true)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

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
  where (select auth.uid()) is not null
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

create or replace function public.correct_inspection(
  target_inspection_id uuid,
  replacement_snapshot jsonb,
  replacement_confirmed_tag public.inspection_tag,
  replacement_override_reason text,
  replacement_restrictions text,
  correction_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  prior public.inspections;
  next_revision integer;
begin
  if not public.is_coordinator() then raise exception 'coordinator role required'; end if;
  if length(trim(coalesce(correction_reason, ''))) = 0 then raise exception 'correction reason required'; end if;

  select * into prior from public.inspections where id = target_inspection_id for update;
  if not found then raise exception 'inspection not found'; end if;
  select coalesce(max(revision_number), 0) + 1 into next_revision
    from public.inspection_revisions where inspection_id = target_inspection_id;

  insert into public.inspection_revisions (
    inspection_id, revision_number, previous_snapshot, replacement_snapshot,
    changed_fields, reason, revised_by
  ) values (
    target_inspection_id, next_revision, prior.questionnaire_snapshot, replacement_snapshot,
    jsonb_build_object('confirmed_tag', replacement_confirmed_tag, 'restrictions', replacement_restrictions),
    correction_reason, (select auth.uid())
  );

  perform set_config('app.coordinator_correction', 'on', true);
  update public.inspections set
    questionnaire_snapshot = replacement_snapshot,
    suggested_tag = public.classify_rapid_conditions(replacement_snapshot),
    confirmed_tag = replacement_confirmed_tag,
    override_reason = replacement_override_reason,
    restrictions = replacement_restrictions,
    has_unassessed_warning = exists (
      select 1 from jsonb_each_text(replacement_snapshot -> 'conditions') c where c.value = 'no_evaluado'
    ),
    corrected_at = now(),
    corrected_by = (select auth.uid())
  where id = target_inspection_id;

  insert into public.audit_events (actor_id, event_type, entity_type, entity_id, reason)
  values ((select auth.uid()), 'inspection.corrected', 'inspection', target_inspection_id, correction_reason);
end;
$$;

create or replace function public.void_inspection(target_inspection_id uuid, reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_coordinator() then raise exception 'coordinator role required'; end if;
  if length(trim(coalesce(reason, ''))) = 0 then raise exception 'void reason required'; end if;
  perform set_config('app.coordinator_correction', 'on', true);
  update public.inspections set status = 'void', voided_at = now(), voided_by = (select auth.uid()), void_reason = reason
  where id = target_inspection_id and status = 'submitted';
  if not found then raise exception 'active inspection not found'; end if;
  insert into public.audit_events (actor_id, event_type, entity_type, entity_id, reason)
  values ((select auth.uid()), 'inspection.voided', 'inspection', target_inspection_id, reason);
end;
$$;

create or replace function public.import_rapid_batch(target_batch_id uuid, rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  target_building_id uuid;
  imported integer := 0;
  probable boolean;
begin
  if not exists (
    select 1 from public.import_batches
    where id = target_batch_id and uploader_id = (select auth.uid()) and status = 'validating'
  ) then raise exception 'invalid import batch'; end if;
  if jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) > 1000 then
    raise exception 'invalid import row count';
  end if;

  for item in select value from jsonb_array_elements(rows)
  loop
    target_building_id := null;
    if nullif(item ->> 'building_code', '') is not null then
      select id into target_building_id from public.buildings where code = item ->> 'building_code';
      if target_building_id is null then raise exception 'building code not found'; end if;
    else
      select id into target_building_id from public.buildings
      where municipality_code = item ->> 'municipality_code'
        and lower(trim(address_reference)) = lower(trim(item ->> 'address_reference'))
      order by created_at limit 1;
    end if;

    if target_building_id is null then
      insert into public.buildings (municipality_code, name, address_reference, created_by)
      values (item ->> 'municipality_code', nullif(item ->> 'building_name', ''), item ->> 'address_reference', (select auth.uid()))
      returning id into target_building_id;
    end if;

    select exists (
      select 1 from public.inspections i
      where i.building_id = target_building_id and i.status = 'submitted'
        and i.submitted_at >= now() - interval '7 days'
    ) into probable;

    insert into public.inspections (
      receipt_code, client_submission_id, building_id, inspector_id, import_batch_id,
      source, form_type, schema_version, inspection_scope, municipality_code,
      address_reference, questionnaire_snapshot, suggested_tag, confirmed_tag,
      override_reason, restrictions, has_unassessed_warning, needs_review,
      duplicate_fingerprint, field_inspected_at
    ) values (
      item ->> 'receipt_code', (item ->> 'client_submission_id')::uuid,
      target_building_id, (select auth.uid()), target_batch_id,
      'excel', 'rapid_ceer', 1, (item ->> 'inspection_scope')::public.inspection_scope,
      item ->> 'municipality_code', item ->> 'address_reference', item -> 'snapshot',
      public.classify_rapid_conditions(item -> 'snapshot'),
      (item ->> 'confirmed_tag')::public.inspection_tag,
      nullif(item ->> 'override_reason', ''), nullif(item ->> 'restrictions', ''),
      (item ->> 'has_unassessed_warning')::boolean, probable,
      item ->> 'duplicate_fingerprint', (item ->> 'field_inspected_at')::timestamptz
    );
    imported := imported + 1;
  end loop;

  update public.import_batches set status = 'imported', row_count = imported,
    imported_count = imported, completed_at = now()
  where id = target_batch_id;
  insert into public.audit_events (actor_id, event_type, entity_type, entity_id, metadata)
  values ((select auth.uid()), 'import.completed', 'import_batch', target_batch_id, jsonb_build_object('row_count', imported));
  return imported;
end;
$$;

create or replace function public.review_building_change_proposal(
  target_proposal_id uuid,
  decision public.proposal_status,
  note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  proposal public.building_change_proposals;
begin
  if not public.is_coordinator() then raise exception 'coordinator role required'; end if;
  if decision not in ('approved', 'rejected') then raise exception 'invalid proposal decision'; end if;
  select * into proposal from public.building_change_proposals where id = target_proposal_id and status = 'pending' for update;
  if not found then raise exception 'pending proposal not found'; end if;

  if decision = 'approved' then
    update public.buildings set
      name = coalesce(proposal.proposed_changes ->> 'name', name),
      address_reference = coalesce(proposal.proposed_changes ->> 'address_reference', address_reference),
      contact = coalesce(proposal.proposed_changes ->> 'contact', contact),
      updated_at = now()
    where id = proposal.building_id;
  end if;

  update public.building_change_proposals set status = decision, reviewed_by = (select auth.uid()), reviewed_at = now(), review_note = note
  where id = target_proposal_id;
  insert into public.audit_events (actor_id, event_type, entity_type, entity_id, reason, metadata)
  values ((select auth.uid()), 'building_change.' || decision::text, 'building_change_proposal', target_proposal_id, note, jsonb_build_object('building_id', proposal.building_id));
end;
$$;

alter table public.profiles enable row level security;
alter table public.municipalities enable row level security;
alter table public.buildings enable row level security;
alter table public.inspections enable row level security;
alter table public.inspection_photos enable row level security;
alter table public.building_change_proposals enable row level security;
alter table public.import_batches enable row level security;
alter table public.inspection_revisions enable row level security;
alter table public.audit_events enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using ((select auth.uid()) = id or public.is_coordinator());
create policy municipalities_select on public.municipalities for select to authenticated using (true);
create policy buildings_coordinator_all on public.buildings for all to authenticated
  using (public.is_coordinator()) with check (public.is_coordinator());
create policy inspections_select on public.inspections for select to authenticated
  using ((select auth.uid()) = inspector_id or public.is_coordinator());
create policy inspections_insert_own on public.inspections for insert to authenticated
  with check ((select auth.uid()) = inspector_id);
create policy photos_select on public.inspection_photos for select to authenticated
  using (public.is_coordinator() or exists (
    select 1 from public.inspections i where i.id = inspection_id and i.inspector_id = (select auth.uid())
  ));
create policy photos_insert_own on public.inspection_photos for insert to authenticated
  with check (created_by = (select auth.uid()) and exists (
    select 1 from public.inspections i where i.id = inspection_id and i.inspector_id = (select auth.uid())
  ));
create policy photos_coordinator_delete on public.inspection_photos for delete to authenticated
  using (public.is_coordinator());
create policy proposals_select on public.building_change_proposals for select to authenticated
  using (proposed_by = (select auth.uid()) or public.is_coordinator());
create policy proposals_insert on public.building_change_proposals for insert to authenticated
  with check (proposed_by = (select auth.uid()));
create policy proposals_coordinator_update on public.building_change_proposals for update to authenticated
  using (public.is_coordinator()) with check (public.is_coordinator());
create policy batches_select on public.import_batches for select to authenticated
  using (uploader_id = (select auth.uid()) or public.is_coordinator());
create policy batches_insert on public.import_batches for insert to authenticated
  with check (uploader_id = (select auth.uid()));
create policy revisions_coordinator_select on public.inspection_revisions for select to authenticated
  using (public.is_coordinator());
create policy audit_coordinator_select on public.audit_events for select to authenticated
  using (public.is_coordinator());

grant execute on function public.search_building_directory(text) to authenticated;
grant execute on function public.correct_inspection(uuid, jsonb, public.inspection_tag, text, text, text) to authenticated;
grant execute on function public.void_inspection(uuid, text) to authenticated;
grant execute on function public.import_rapid_batch(uuid, jsonb) to authenticated;
grant execute on function public.review_building_change_proposal(uuid, public.proposal_status, text) to authenticated;
revoke all on public.audit_events from anon, authenticated;
grant select on public.audit_events to authenticated;
revoke update on public.profiles from authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inspection-photos', 'inspection-photos', false, 12582912, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy inspection_photo_objects_select on storage.objects for select to authenticated
using (
  bucket_id = 'inspection-photos'
  and exists (
    select 1 from public.inspections i
    where i.id::text = (storage.foldername(name))[1]
      and (i.inspector_id = (select auth.uid()) or public.is_coordinator())
  )
);
create policy inspection_photo_objects_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'inspection-photos'
  and exists (
    select 1 from public.inspections i
    where i.id::text = (storage.foldername(name))[1]
      and i.inspector_id = (select auth.uid())
  )
);
create policy inspection_photo_objects_delete on storage.objects for delete to authenticated
using (bucket_id = 'inspection-photos' and public.is_coordinator());
