-- ============================================================
-- Nolt HR — 0023: Unpublish, Unarchive & Hard Delete RPCs
--
-- Enables HR and Admin users to:
-- 1. Unpublish a published onboarding package version back to draft (so it can be edited & re-published)
-- 2. Unarchive / restore an archived onboarding package back to active library
-- 3. Permanently hard-delete an archived (or draft) onboarding package from the database
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 0. Allow one more version-immutability transition: published -> draft.
--
-- 0021 taught this trigger to allow published -> superseded (automatic, when
-- a newer draft is published). "Unpublish to Draft" below needs a second,
-- equally explicit transition: published -> draft, clearing published_at /
-- published_by. Every other field must stay identical, and every other
-- published/superseded mutation remains rejected exactly as before.
-- ------------------------------------------------------------
create or replace function public.enforce_onboarding_package_version_immutability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if TG_OP = 'UPDATE' then
    if OLD.state = 'published' and NEW.state = 'superseded'
       and NEW.version_number = OLD.version_number
       and NEW.onboarding_package_id = OLD.onboarding_package_id
       and NEW.created_by = OLD.created_by
       and NEW.created_at = OLD.created_at
       and NEW.published_at = OLD.published_at
       and NEW.published_by = OLD.published_by
       and NEW.revision = OLD.revision
    then
      return NEW;
    end if;
    if OLD.state = 'published' and NEW.state = 'draft'
       and NEW.version_number = OLD.version_number
       and NEW.onboarding_package_id = OLD.onboarding_package_id
       and NEW.created_by = OLD.created_by
       and NEW.created_at = OLD.created_at
       and NEW.published_at is null
       and NEW.published_by is null
       and NEW.revision = OLD.revision
    then
      return NEW;
    end if;
    if OLD.state in ('published', 'superseded') then
      raise exception 'Published onboarding package versions are immutable and cannot be modified.'
        using errcode = 'P0001';
    end if;
    return NEW;
  elsif TG_OP = 'DELETE' then
    if OLD.state in ('published', 'superseded') then
      raise exception 'Published onboarding package versions cannot be deleted.'
        using errcode = 'P0001';
    end if;
    return OLD;
  end if;
  return NEW;
end;
$$;

-- ------------------------------------------------------------
-- 1. RPC: unpublish_onboarding_package_draft
-- ------------------------------------------------------------
create or replace function public.unpublish_onboarding_package_draft(
  p_onboarding_package_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_role public.user_role;
  v_package record;
  v_published record;
begin
  v_user_id := auth.uid();
  v_role := public.current_user_role();
  if v_user_id is null or v_role is null or v_role not in ('admin', 'hr') then
    return jsonb_build_object('ok', false, 'error_code', 'UNAUTHORIZED', 'error', 'Only admin or HR can unpublish onboarding packages.');
  end if;

  select * into v_package
  from public.onboarding_packages
  where id = p_onboarding_package_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'PACKAGE_NOT_FOUND', 'error', 'Onboarding package not found.');
  end if;

  if v_package.archived_at is not null then
    return jsonb_build_object('ok', false, 'error_code', 'PACKAGE_ARCHIVED', 'error', 'This package is archived and cannot be unpublished.');
  end if;

  select * into v_published
  from public.onboarding_package_versions
  where onboarding_package_id = p_onboarding_package_id and state = 'published'
  order by version_number desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'NO_PUBLISHED_VERSION', 'error', 'This package has no published version to unpublish.');
  end if;

  update public.onboarding_package_versions
  set state = 'draft',
      published_at = null,
      published_by = null,
      updated_by = v_user_id,
      updated_at = now()
  where id = v_published.id;

  return jsonb_build_object(
    'ok', true,
    'version_id', v_published.id,
    'version_number', v_published.version_number
  );
end;
$$;

revoke all on function public.unpublish_onboarding_package_draft(uuid) from public, anon;
grant execute on function public.unpublish_onboarding_package_draft(uuid) to authenticated;

-- ------------------------------------------------------------
-- 2. RPC: unarchive_onboarding_package
-- ------------------------------------------------------------
create or replace function public.unarchive_onboarding_package(
  p_onboarding_package_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_role public.user_role;
  v_package record;
begin
  v_user_id := auth.uid();
  v_role := public.current_user_role();
  if v_user_id is null or v_role is null or v_role not in ('admin', 'hr') then
    return jsonb_build_object('ok', false, 'error_code', 'UNAUTHORIZED', 'error', 'Only admin or HR can restore onboarding packages.');
  end if;

  select * into v_package
  from public.onboarding_packages
  where id = p_onboarding_package_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'PACKAGE_NOT_FOUND', 'error', 'Onboarding package not found.');
  end if;

  if v_package.archived_at is null then
    return jsonb_build_object('ok', true, 'already_active', true);
  end if;

  update public.onboarding_packages
  set archived_at = null,
      archived_by = null,
      updated_by = v_user_id,
      updated_at = now()
  where id = p_onboarding_package_id;

  return jsonb_build_object('ok', true, 'already_active', false);
end;
$$;

revoke all on function public.unarchive_onboarding_package(uuid) from public, anon;
grant execute on function public.unarchive_onboarding_package(uuid) to authenticated;

-- ------------------------------------------------------------
-- 3. RPC: delete_onboarding_package (Hard delete)
-- ------------------------------------------------------------
create or replace function public.delete_onboarding_package(
  p_onboarding_package_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_role public.user_role;
  v_package record;
begin
  v_user_id := auth.uid();
  v_role := public.current_user_role();
  if v_user_id is null or v_role is null or v_role not in ('admin', 'hr') then
    return jsonb_build_object('ok', false, 'error_code', 'UNAUTHORIZED', 'error', 'Only admin or HR can delete onboarding packages.');
  end if;

  select * into v_package
  from public.onboarding_packages
  where id = p_onboarding_package_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'PACKAGE_NOT_FOUND', 'error', 'Onboarding package not found.');
  end if;

  -- Published/superseded versions (and their items) are protected by immutability
  -- triggers. A hard delete is an explicit admin override of that protection, so
  -- the triggers are disabled for the duration of this statement only. Because DDL
  -- is transactional in Postgres, if anything below raises, the ALTER TABLE calls
  -- roll back with everything else and the triggers are never left disabled.
  alter table public.onboarding_package_items disable trigger check_onboarding_package_item_immutability;
  alter table public.onboarding_package_versions disable trigger check_onboarding_package_version_immutability;

  delete from public.onboarding_package_items
  where package_version_id in (
    select id from public.onboarding_package_versions where onboarding_package_id = p_onboarding_package_id
  );

  delete from public.onboarding_package_versions
  where onboarding_package_id = p_onboarding_package_id;

  alter table public.onboarding_package_versions enable trigger check_onboarding_package_version_immutability;
  alter table public.onboarding_package_items enable trigger check_onboarding_package_item_immutability;

  -- Delete package header
  delete from public.onboarding_packages
  where id = p_onboarding_package_id;

  return jsonb_build_object('ok', true, 'deleted', true);
end;
$$;

revoke all on function public.delete_onboarding_package(uuid) from public, anon;
grant execute on function public.delete_onboarding_package(uuid) to authenticated;

commit;
