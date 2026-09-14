-- ============================================================
-- Nolt HR — 0011: form version semantics & field key validation
--
-- Additive migration:
-- 1. Updates publish_form_version RPC so older published versions
--    remain PUBLISHED (immutable snapshots for future onboarding package pinning).
-- 2. Enforces strict field_key regex ^[a-z][a-z0-9_]*$ in server validation
--    and database CHECK constraint (must start with lowercase letter).
-- ============================================================

-- Update form_fields field_key CHECK constraint to require leading lowercase letter
alter table public.form_fields drop constraint if exists form_fields_field_key_check;
alter table public.form_fields add constraint form_fields_field_key_check
  check (field_key = lower(btrim(field_key)) and field_key ~ '^[a-z][a-z0-9_]*$');

-- RPC: Publish Form Version (preserves older published versions as immutable snapshots)
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
  -- Enforces rule: ^[a-z][a-z0-9_]*$
  select count(*) into v_invalid_key_count
  from public.form_fields
  where form_version_id = p_form_version_id
    and field_type not in ('HEADING', 'PARAGRAPH', 'DIVIDER')
    and (field_key is null or btrim(field_key) = '' or field_key !~ '^[a-z][a-z0-9_]*$');

  if v_invalid_key_count > 0 then
    return jsonb_build_object('ok', false, 'error', 'All input fields must have valid machine keys starting with a lowercase letter');
  end if;

  -- Publish target version (older published versions remain PUBLISHED as immutable snapshots)
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
