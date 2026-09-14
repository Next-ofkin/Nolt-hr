-- ============================================================
-- Nolt HR — 0012: Form Studio & AI PDF Import foundation
--
-- Additive migration:
-- 1. Adds presentation_config JSONB column to form_versions.
-- 2. Updates create_form_draft_from_version RPC to clone presentation_config.
-- 3. Creates form_import_status enum & public.form_import_jobs table.
-- 4. Enforces strict admin/hr RLS policies on form_import_jobs.
-- 5. Creates private storage bucket 'form-imports' with strict RLS.
-- 6. Creates accept_form_import_job RPC creating template & V1 DRAFT.
-- ============================================================

-- Add presentation_config to form_versions
alter table public.form_versions add column if not exists presentation_config jsonb not null default '{
  "mode": "STANDARD",
  "brandStyle": "nolt",
  "showHeader": true,
  "showFooter": true,
  "paperSize": "A4",
  "contentWidth": "normal"
}'::jsonb;

-- Update create_form_draft_from_version RPC to include presentation_config
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
    instructions,
    presentation_config
  ) values (
    v_source.form_template_id,
    v_next_version,
    'DRAFT',
    v_source.title,
    v_source.description,
    v_source.instructions,
    coalesce(v_source.presentation_config, '{}'::jsonb)
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

-- Form Import Status Enum
do $$ begin
  create type public.form_import_status as enum (
    'UPLOADED',
    'ANALYZING',
    'READY_FOR_REVIEW',
    'ACCEPTED',
    'FAILED',
    'CANCELLED'
  );
exception
  when duplicate_object then null;
end $$;

-- Form Import Jobs Table
create table if not exists public.form_import_jobs (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  original_filename text not null,
  source_object_path text not null,
  status public.form_import_status not null default 'UPLOADED',
  proposed_schema jsonb,
  provider text,
  model text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  accepted_at timestamptz,
  cancelled_at timestamptz
);

create index if not exists form_import_jobs_created_by_idx on public.form_import_jobs (created_by);
create index if not exists form_import_jobs_status_idx on public.form_import_jobs (status);

-- Updated_at trigger
create trigger form_import_jobs_set_updated_at
  before update on public.form_import_jobs
  for each row execute function public.set_updated_at();

-- RLS for Form Import Jobs
alter table public.form_import_jobs enable row level security;

create policy form_import_jobs_select on public.form_import_jobs
  for select to authenticated
  using ((select public.current_user_role()) in ('admin', 'hr'));

create policy form_import_jobs_insert on public.form_import_jobs
  for insert to authenticated
  with check ((select public.current_user_role()) in ('admin', 'hr'));

create policy form_import_jobs_update on public.form_import_jobs
  for update to authenticated
  using ((select public.current_user_role()) in ('admin', 'hr'))
  with check ((select public.current_user_role()) in ('admin', 'hr'));

create policy form_import_jobs_delete on public.form_import_jobs
  for delete to authenticated
  using ((select public.current_user_role()) in ('admin', 'hr'));

revoke all on public.form_import_jobs from anon;
revoke all on public.form_import_jobs from authenticated;
grant select, insert, update, delete on public.form_import_jobs to authenticated;

-- Private Storage Bucket: form-imports
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('form-imports', 'form-imports', false, 15728640, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 15728640, allowed_mime_types = array['application/pdf'];

-- Storage RLS Policies for form-imports bucket
create policy "Admin & HR manage form-imports objects" on storage.objects
  for all to authenticated
  using (bucket_id = 'form-imports' and (select public.current_user_role()) in ('admin', 'hr'))
  with check (bucket_id = 'form-imports' and (select public.current_user_role()) in ('admin', 'hr'));

-- RPC: Accept Form Import Job (creates template + V1 DRAFT form)
create or replace function public.accept_form_import_job(
  p_job_id uuid,
  p_name text,
  p_category text,
  p_description text,
  p_instructions text,
  p_presentation jsonb,
  p_fields jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
  v_job record;
  v_template_id uuid;
  v_version_id uuid;
  v_elem jsonb;
  v_idx integer := 0;
  v_field_key text;
  v_field_type public.form_field_type;
begin
  v_role := public.current_user_role();
  if v_role is null or v_role not in ('admin', 'hr') then
    return jsonb_build_object('ok', false, 'error', 'Unauthorized');
  end if;

  select * into v_job
  from public.form_import_jobs
  where id = p_job_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Import job not found');
  end if;

  if v_job.status in ('ACCEPTED', 'CANCELLED') then
    return jsonb_build_object('ok', false, 'error', 'Import job already completed or cancelled');
  end if;

  if btrim(p_name) = '' then
    return jsonb_build_object('ok', false, 'error', 'Form name cannot be empty');
  end if;

  -- 1. Create Template
  insert into public.form_templates (
    name,
    category,
    description,
    created_by
  ) values (
    btrim(p_name),
    coalesce(nullif(btrim(p_category), ''), 'General'),
    p_description,
    auth.uid()
  ) returning id into v_template_id;

  -- 2. Create Version 1 DRAFT (Strictly DRAFT, never PUBLISHED)
  insert into public.form_versions (
    form_template_id,
    version_number,
    status,
    title,
    description,
    instructions,
    presentation_config
  ) values (
    v_template_id,
    1,
    'DRAFT',
    btrim(p_name),
    p_description,
    p_instructions,
    coalesce(p_presentation, '{}'::jsonb)
  ) returning id into v_version_id;

  -- 3. Insert Fields
  if jsonb_typeof(p_fields) = 'array' then
    for v_elem in select * from jsonb_array_elements(p_fields)
    loop
      v_field_type := (v_elem->>'field_type')::public.form_field_type;
      v_field_key := lower(btrim(coalesce(v_elem->>'field_key', 'field_' || v_idx)));
      if v_field_type not in ('HEADING', 'PARAGRAPH', 'DIVIDER') and v_field_key !~ '^[a-z][a-z0-9_]*$' then
        v_field_key := 'field_' || v_idx;
      end if;

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
      ) values (
        v_version_id,
        v_field_type,
        v_elem->>'label',
        v_elem->>'description',
        v_elem->>'placeholder',
        coalesce((v_elem->>'required')::boolean, false),
        v_idx,
        v_field_key,
        coalesce(v_elem->'configuration', '{}'::jsonb)
      );

      v_idx := v_idx + 1;
    end loop;
  end if;

  -- 4. Mark Job Accepted
  update public.form_import_jobs
  set status = 'ACCEPTED',
      accepted_at = now(),
      updated_at = now()
  where id = p_job_id;

  return jsonb_build_object(
    'ok', true,
    'template_id', v_template_id,
    'version_id', v_version_id
  );
end;
$$;

grant execute on function public.accept_form_import_job(uuid, text, text, text, text, jsonb, jsonb) to authenticated;
