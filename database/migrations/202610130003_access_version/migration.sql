-- Access changes invalidate existing sessions even if an operator omits a revision bump.
CREATE FUNCTION bump_user_access_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.role IS DISTINCT FROM OLD.role OR NEW.active IS DISTINCT FROM OLD.active OR NEW.permissions IS DISTINCT FROM OLD.permissions THEN
   NEW."authVersion" := OLD."authVersion" + 1;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER user_access_version BEFORE UPDATE ON "User"
FOR EACH ROW EXECUTE FUNCTION bump_user_access_version();
