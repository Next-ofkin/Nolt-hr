-- Defence in depth: an assigned or published Pack snapshot must never drift.
-- Draft Pack items remain editable; published/withdrawn items are immutable.
BEGIN;
CREATE OR REPLACE FUNCTION public.nolt_prevent_locked_pack_mutation()
RETURNS trigger LANGUAGE plpgsql AS $pack_guard$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'Published Pack versions cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'DRAFT' THEN
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
REVOKE ALL ON FUNCTION public.nolt_prevent_locked_pack_mutation() FROM PUBLIC;
CREATE TRIGGER nolt_pack_template_immutability
BEFORE UPDATE OR DELETE ON public."PackTemplate"
FOR EACH ROW EXECUTE FUNCTION public.nolt_prevent_locked_pack_mutation();

CREATE OR REPLACE FUNCTION public.nolt_prevent_locked_pack_item()
RETURNS trigger LANGUAGE plpgsql AS $item_guard$
DECLARE template_status TEXT;
BEGIN
  SELECT status INTO template_status FROM public."PackTemplate"
    WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD."packId" ELSE NEW."packId" END
    FOR UPDATE;
  IF template_status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'Published Pack items cannot be changed';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND NEW."packId" IS DISTINCT FROM OLD."packId" THEN
    RAISE EXCEPTION 'Pack item cannot be moved between versions';
  END IF;
  RETURN NEW;
END $item_guard$;
REVOKE ALL ON FUNCTION public.nolt_prevent_locked_pack_item() FROM PUBLIC;
CREATE TRIGGER nolt_pack_item_immutability
BEFORE INSERT OR UPDATE OR DELETE ON public."PackItem"
FOR EACH ROW EXECUTE FUNCTION public.nolt_prevent_locked_pack_item();
COMMIT;
