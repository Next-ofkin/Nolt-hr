-- Permit HR to withdraw an immutable published version without rewriting evidence.
-- Deletion remains restricted by FormsService to never-published, never-assigned drafts.
BEGIN;
CREATE OR REPLACE FUNCTION public.protect_published_form() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD."status" IN ('PUBLISHED', 'UNPUBLISHED') THEN
    IF TG_OP = 'UPDATE'
      AND OLD."status" = 'PUBLISHED'
      AND NEW."status" = 'UNPUBLISHED'
      AND NEW."revision" = OLD."revision" + 1
      AND (to_jsonb(NEW) - 'status' - 'revision' - 'updatedAt')
        = (to_jsonb(OLD) - 'status' - 'revision' - 'updatedAt')
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Published form versions are immutable';
  END IF;
  IF TG_OP = 'DELETE' AND OLD."status" <> 'DRAFT' THEN
    RAISE EXCEPTION 'Only drafts can be deleted';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
-- Runtime can delete only form versions and parent forms (never audit records);
-- service rules and FK RESTRICT protect assignments and history.
GRANT DELETE ON public."Form", public."FormVersion" TO nolt_app;
COMMIT;
