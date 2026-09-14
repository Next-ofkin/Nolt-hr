-- ============================================================
-- Nolt HR — 0013: Harden accept_form_import_job RPC status guard
--
-- Additive migration:
-- Updates accept_form_import_job to strictly require status = 'READY_FOR_REVIEW'.
-- Prevents acceptance of FAILED, UPLOADED, ANALYZING, or CANCELLED jobs.
-- ============================================================

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

  -- Strictly require status = READY_FOR_REVIEW
  if v_job.status != 'READY_FOR_REVIEW' then
    return jsonb_build_object('ok', false, 'error', 'Import job is not ready for review');
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
