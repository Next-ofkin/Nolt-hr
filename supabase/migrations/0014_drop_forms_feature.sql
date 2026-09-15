-- Migration: 0014_drop_forms_feature.sql
-- Description: Safely drop all Forms, Form Studio, and AI PDF Import database and storage infrastructure.

BEGIN;

-- 1. Drop storage policies for form-imports bucket if existing
DROP POLICY IF EXISTS "Admin and HR can manage form imports bucket" ON storage.objects;
DROP POLICY IF EXISTS "Admin and HR can read form imports bucket" ON storage.objects;
DROP POLICY IF EXISTS "Admin and HR can upload form imports bucket" ON storage.objects;

-- 2. Drop Forms-specific RPCs / Functions
DROP FUNCTION IF EXISTS public.accept_form_import_job CASCADE;
DROP FUNCTION IF EXISTS public.publish_form_version CASCADE;
DROP FUNCTION IF EXISTS public.create_form_draft_from_version CASCADE;

-- 3. Drop Forms Tables (dependency-safe order)
DROP TABLE IF EXISTS public.form_fields CASCADE;
DROP TABLE IF EXISTS public.form_versions CASCADE;
DROP TABLE IF EXISTS public.form_templates CASCADE;
DROP TABLE IF EXISTS public.form_import_jobs CASCADE;

-- 4. Drop Forms Enums
DROP TYPE IF EXISTS public.form_field_type CASCADE;
DROP TYPE IF EXISTS public.form_version_status CASCADE;
DROP TYPE IF EXISTS public.form_import_status CASCADE;

COMMIT;
