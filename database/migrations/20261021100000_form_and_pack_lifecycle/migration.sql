-- HR may unpublish, reopen for editing and delete a form version or pack that has
-- NEVER been used. Anything already sent to an employee (a form assignment, or a pack
-- assignment / pack item that points at it) stays locked so signed evidence is kept.
BEGIN;

-- The earlier "unpublish" change never allowed the UNPUBLISHED value in these two rules,
-- so unpublishing a form was rejected by the database. Allow it.
ALTER TABLE public."FormVersion" DROP CONSTRAINT "FormVersion_status_check";
ALTER TABLE public."FormVersion" ADD CONSTRAINT "FormVersion_status_check"
  CHECK ("status" IN ('DRAFT', 'PUBLISHED', 'UNPUBLISHED'));
ALTER TABLE public."FormVersion" DROP CONSTRAINT published_evidence;
ALTER TABLE public."FormVersion" ADD CONSTRAINT published_evidence CHECK (
  ("status" = 'DRAFT' AND "publishedAt" IS NULL)
  OR ("status" IN ('PUBLISHED', 'UNPUBLISHED') AND "publishedAt" IS NOT NULL)
);

CREATE OR REPLACE FUNCTION public.protect_published_form() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE in_use boolean;
BEGIN
  IF OLD."status" IN ('PUBLISHED', 'UNPUBLISHED') THEN
    -- Withdrawing a published version never rewrites its content.
    IF TG_OP = 'UPDATE'
      AND OLD."status" = 'PUBLISHED'
      AND NEW."status" = 'UNPUBLISHED'
      AND NEW."revision" = OLD."revision" + 1
      AND (to_jsonb(NEW) - 'status' - 'revision' - 'updatedAt')
        = (to_jsonb(OLD) - 'status' - 'revision' - 'updatedAt')
    THEN
      RETURN NEW;
    END IF;
    SELECT EXISTS (SELECT 1 FROM public."FormAssignment" WHERE "formVersionId" = OLD."id")
        OR EXISTS (SELECT 1 FROM public."PackItem" WHERE "formVersionId" = OLD."id")
      INTO in_use;
    IF NOT in_use THEN
      -- Never used: it can go back to being an editable draft, or be deleted.
      IF TG_OP = 'UPDATE' AND OLD."status" = 'UNPUBLISHED' AND NEW."status" = 'DRAFT' THEN
        RETURN NEW;
      END IF;
      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;
    END IF;
    RAISE EXCEPTION 'Published form versions are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.nolt_prevent_locked_pack_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $pack_guard$
DECLARE assigned boolean; has_later boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'Published Pack versions cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'DRAFT' THEN
    SELECT EXISTS (SELECT 1 FROM public."PackAssignment" WHERE "packId" = OLD.id) INTO assigned;
    SELECT EXISTS (
      SELECT 1 FROM public."PackTemplate" t
      WHERE t.id <> OLD.id
        AND COALESCE(t."rootPackId", t.id) = COALESCE(OLD."rootPackId", OLD.id)
        AND t."versionNumber" > OLD."versionNumber"
    ) INTO has_later;
    -- A pack nobody has been given, with no newer version, can go back to a draft.
    IF NEW.status = 'DRAFT' AND NOT assigned AND NOT has_later THEN
      RETURN NEW;
    END IF;
    IF NEW.name IS DISTINCT FROM OLD.name
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW."employmentType" IS DISTINCT FROM OLD."employmentType"
      OR NEW."createdBy" IS DISTINCT FROM OLD."createdBy"
      OR NEW."rootPackId" IS DISTINCT FROM OLD."rootPackId"
      OR NEW."versionNumber" IS DISTINCT FROM OLD."versionNumber"
      OR NEW.revision IS DISTINCT FROM OLD.revision
      OR NEW."publishedAt" IS DISTINCT FROM OLD."publishedAt" THEN
      RAISE EXCEPTION 'Published Pack contents and version identity are immutable';
    END IF;
  END IF;
  IF OLD.status = 'PUBLISHED' AND NEW.status = 'DRAFT' THEN
    RAISE EXCEPTION 'Published Packs cannot return to draft';
  END IF;
  IF OLD.status = 'WITHDRAWN' AND NEW.status <> 'WITHDRAWN' THEN
    RAISE EXCEPTION 'Withdrawn Packs cannot be reactivated';
  END IF;
  RETURN NEW;
END $pack_guard$;

-- The app deletes only never-assigned packs (after returning them to draft).
GRANT DELETE ON public."PackTemplate" TO nolt_app;
COMMIT;
