-- ============================================================
-- Nolt HR — 0009: form builder core
--
-- Adds form_templates, form_versions, form_fields tables,
-- field type and version status enums, immutability triggers,
-- publishing and draft creation RPCs, and RBAC RLS policies.
-- ============================================================

create type public.form_field_type as enum (
  'SHORT_TEXT',
  'LONG_TEXT',
  'EMAIL',
  'PHONE',
  'NUMBER',
  'DATE',
  'DROPDOWN',
  'RADIO',
  'CHECKBOX',
  'YES_NO',
  'FILE_UPLOAD',
  'SIGNATURE',
  'HEADING',
  'PARAGRAPH',
  'DIVIDER',
  'REPEATING_GROUP'
);

create type public.form_version_status as enum (
  'DRAFT',
  'PUBLISHED',
  'ARCHIVED'
);

-- Form Templates
create table public.form_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  description text,
  category text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index form_templates_name_idx on public.form_templates (lower(btrim(name)));
create index form_templates_category_idx on public.form_templates (category);

-- Form Versions
create table public.form_versions (
  id uuid primary key default gen_random_uuid(),
  form_template_id uuid not null references public.form_templates(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  status public.form_version_status not null default 'DRAFT',
  title text not null check (btrim(title) <> ''),
  description text,
  instructions text,
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (form_template_id, version_number)
);

create index form_versions_template_id_idx on public.form_versions (form_template_id);
create index form_versions_status_idx on public.form_versions (status);

-- Form Fields
create table public.form_fields (
  id uuid primary key default gen_random_uuid(),
  form_version_id uuid not null references public.form_versions(id) on delete cascade,
  field_type public.form_field_type not null,
  label text,
  description text,
  placeholder text,
  required boolean not null default false,
  position integer not null check (position >= 0),
  field_key text not null check (field_key = lower(btrim(field_key)) and field_key ~ '^[a-z0-9_]+$'),
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (form_version_id, field_key)
);

create index form_fields_version_id_idx on public.form_fields (form_version_id);
create index form_fields_position_idx on public.form_fields (form_version_id, position);

-- Timestamps triggers
create trigger form_templates_set_updated_at
  before update on public.form_templates
  for each row execute function public.set_updated_at();

create trigger form_versions_set_updated_at
  before update on public.form_versions
  for each row execute function public.set_updated_at();

create trigger form_fields_set_updated_at
  before update on public.form_fields
  for each row execute function public.set_updated_at();

-- Database Immutability Enforcement for Published Versions
create or replace function public.enforce_form_version_immutability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'UPDATE' then
    if OLD.status = 'PUBLISHED' then
      raise exception 'Published form versions are immutable and cannot be updated.';
    end if;
  elsif TG_OP = 'DELETE' then
    if OLD.status = 'PUBLISHED' then
      raise exception 'Published form versions cannot be deleted.';
    end if;
  end if;
  return NEW;
end;
$$;

create trigger check_form_version_immutability
  before update or delete on public.form_versions
  for each row execute function public.enforce_form_version_immutability();

create or replace function public.enforce_form_field_immutability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.form_version_status;
  v_version_id uuid;
begin
  if TG_OP = 'DELETE' then
    v_version_id := OLD.form_version_id;
  else
    v_version_id := NEW.form_version_id;
  end if;

  select status into v_status
  from public.form_versions
  where id = v_version_id;

  if v_status = 'PUBLISHED' then
    raise exception 'Fields on published form versions cannot be modified or deleted.';
  end if;

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

create trigger check_form_field_immutability
  before insert or update or delete on public.form_fields
  for each row execute function public.enforce_form_field_immutability();

-- RPC: Publish Form Version
create or replace function public.publish_form_version(p_form_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
  v_version record;
  v_field_count integer;
begin
  v_role := public.current_user_role();
  if v_role is null or v_role not in ('admin', 'hr') then
    return jsonb_build_object('ok', false, 'error', 'Unauthorized');
  end if;

  select * into v_version
  from public.form_versions
  where id = p_form_version_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Form version not found');
  end if;

  if v_version.status <> 'DRAFT' then
    return jsonb_build_object('ok', false, 'error', 'Only DRAFT versions can be published');
  end if;

  if btrim(v_version.title) = '' then
    return jsonb_build_object('ok', false, 'error', 'Form title cannot be empty');
  end if;

  select count(*) into v_field_count
  from public.form_fields
  where form_version_id = p_form_version_id;

  if v_field_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'Form must contain at least one field before publishing');
  end if;

  update public.form_versions
  set status = 'PUBLISHED',
      published_at = now(),
      published_by = auth.uid(),
      updated_at = now()
  where id = p_form_version_id;

  return jsonb_build_object('ok', true, 'version_id', p_form_version_id);
end;
$$;

grant execute on function public.publish_form_version(uuid) to authenticated;

-- RPC: Create Form Draft From Published Version
create or replace function public.create_form_draft_from_version(p_form_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
  v_source record;
  v_next_version integer;
  v_new_version_id uuid;
begin
  v_role := public.current_user_role();
  if v_role is null or v_role not in ('admin', 'hr') then
    return jsonb_build_object('ok', false, 'error', 'Unauthorized');
  end if;

  select * into v_source
  from public.form_versions
  where id = p_form_version_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Source form version not found');
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next_version
  from public.form_versions
  where form_template_id = v_source.form_template_id;

  insert into public.form_versions (
    form_template_id,
    version_number,
    status,
    title,
    description,
    instructions
  ) values (
    v_source.form_template_id,
    v_next_version,
    'DRAFT',
    v_source.title,
    v_source.description,
    v_source.instructions
  )
  returning id into v_new_version_id;

  insert into public.form_fields (
    form_version_id,
    field_type,
    label,
    description,
    placeholder,
    required,
    position,
    field_key,
    configuration
  )
  select
    v_new_version_id,
    field_type,
    label,
    description,
    placeholder,
    required,
    position,
    field_key,
    configuration
  from public.form_fields
  where form_version_id = p_form_version_id;

  return jsonb_build_object('ok', true, 'new_version_id', v_new_version_id, 'version_number', v_next_version);
end;
$$;

grant execute on function public.create_form_draft_from_version(uuid) to authenticated;

-- RLS & Grants for Form Builder
alter table public.form_templates enable row level security;
alter table public.form_versions enable row level security;
alter table public.form_fields enable row level security;

create policy form_templates_select
  on public.form_templates for select
  to authenticated
  using ((select public.current_user_role()) in ('admin', 'hr'));

create policy form_templates_insert
  on public.form_templates for insert
  to authenticated
  with check ((select public.current_user_role()) in ('admin', 'hr'));

create policy form_templates_update
  on public.form_templates for update
  to authenticated
  using ((select public.current_user_role()) in ('admin', 'hr'))
  with check ((select public.current_user_role()) in ('admin', 'hr'));

create policy form_versions_select
  on public.form_versions for select
  to authenticated
  using ((select public.current_user_role()) in ('admin', 'hr'));

create policy form_versions_insert
  on public.form_versions for insert
  to authenticated
  with check ((select public.current_user_role()) in ('admin', 'hr'));

create policy form_versions_update
  on public.form_versions for update
  to authenticated
  using ((select public.current_user_role()) in ('admin', 'hr'))
  with check ((select public.current_user_role()) in ('admin', 'hr'));

create policy form_versions_delete
  on public.form_versions for delete
  to authenticated
  using (
    (select public.current_user_role()) in ('admin', 'hr')
    and status = 'DRAFT'
  );

create policy form_fields_select
  on public.form_fields for select
  to authenticated
  using ((select public.current_user_role()) in ('admin', 'hr'));

create policy form_fields_insert
  on public.form_fields for insert
  to authenticated
  with check ((select public.current_user_role()) in ('admin', 'hr'));

create policy form_fields_update
  on public.form_fields for update
  to authenticated
  using ((select public.current_user_role()) in ('admin', 'hr'))
  with check ((select public.current_user_role()) in ('admin', 'hr'));

create policy form_fields_delete
  on public.form_fields for delete
  to authenticated
  using ((select public.current_user_role()) in ('admin', 'hr'));

revoke all on public.form_templates, public.form_versions, public.form_fields from anon;
revoke all on public.form_templates, public.form_versions, public.form_fields from authenticated;

grant select, insert, update, delete on public.form_templates, public.form_versions, public.form_fields to authenticated;
