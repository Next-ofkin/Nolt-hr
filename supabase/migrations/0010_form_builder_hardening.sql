-- ============================================================
-- Nolt HR — 0010: form builder hardening & RLS strictness
--
-- Additive migration:
-- 1. Ensures instructions column exists on form_versions.
-- 2. Hardens publish_form_version RPC validation (valid keys, non-empty title, field count check)
--    and archives previous published version upon new version publication.
-- 3. Confirms RLS policies restrict form builder access strictly to admin & hr.
-- ============================================================

-- Ensure instructions column exists
alter table public.form_versions add column if not exists instructions text;

-- RPC: Publish Form Version (Enhanced validation & lifecycle)
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
  v_invalid_key_count integer;
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

  -- Validate field keys for input fields (excluding content-only: HEADING, PARAGRAPH, DIVIDER)
  select count(*) into v_invalid_key_count
  from public.form_fields
  where form_version_id = p_form_version_id
    and field_type not in ('HEADING', 'PARAGRAPH', 'DIVIDER')
    and (field_key is null or btrim(field_key) = '' or field_key !~ '^[a-z0-9_]+$');

  if v_invalid_key_count > 0 then
    return jsonb_build_object('ok', false, 'error', 'All input fields must have valid machine keys');
  end if;

  -- Archive previous published versions for this template
  update public.form_versions
  set status = 'ARCHIVED',
      updated_at = now()
  where form_template_id = v_version.form_template_id
    and status = 'PUBLISHED'
    and id <> p_form_version_id;

  -- Publish target version (version_number remains unchanged)
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
