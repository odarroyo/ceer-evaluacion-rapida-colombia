-- Use portable character classes. With standard_conforming_strings enabled,
-- the original doubled backslash made \d literal and rejected valid codes.
alter table public.municipalities
  drop constraint municipalities_code_check,
  add constraint municipalities_code_check check (code ~ '^[0-9]{5}$');

alter table public.municipalities
  drop constraint municipalities_department_code_check,
  add constraint municipalities_department_code_check check (department_code ~ '^[0-9]{2}$');
