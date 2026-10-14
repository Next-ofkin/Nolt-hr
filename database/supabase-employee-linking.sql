BEGIN;
-- A verified invitee may still lack a password if setup was interrupted after email confirmation.
CREATE OR REPLACE FUNCTION nolt_private.employee_password_required(p_email TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT COALESCE((SELECT COALESCE(a.encrypted_password,'')='' FROM auth.users a WHERE lower(a.email)=lower(p_email) LIMIT 1),true);
$$;
REVOKE ALL ON FUNCTION nolt_private.employee_password_required(TEXT) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION nolt_private.employee_password_required(TEXT) TO nolt_app;
-- Only a verified Auth account may claim an as-yet-unlinked HR employee profile.
CREATE OR REPLACE FUNCTION nolt_private.confirmed_employee_user(p_email TEXT) RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT a.id FROM auth.users a JOIN public."User" u ON u.id=a.id
 WHERE lower(a.email)=lower(p_email) AND a.email_confirmed_at IS NOT NULL AND u.active AND u.role='EMPLOYEE' LIMIT 1;
$$;
REVOKE ALL ON FUNCTION nolt_private.confirmed_employee_user(TEXT) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION nolt_private.confirmed_employee_user(TEXT) TO nolt_app;
CREATE OR REPLACE FUNCTION nolt_private.link_employee_auth() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target UUID;
BEGIN
 IF NEW.email_confirmed_at IS NULL THEN RETURN NEW; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(lower(NEW.email),2026101305));
 UPDATE public."Employee" SET "userId"=NEW.id,revision=revision+1,"updatedAt"=now()
 WHERE email=lower(NEW.email) AND "userId" IS NULL
 AND EXISTS(SELECT 1 FROM public."User" WHERE id=NEW.id AND active AND role='EMPLOYEE')
 RETURNING id INTO target;
 IF target IS NOT NULL THEN
  INSERT INTO public."AuditEvent"(id,"actorId",action,"targetId") VALUES(gen_random_uuid(),NEW.id,'EMPLOYEE_ACCOUNT_LINKED',target);
  INSERT INTO public."OutboxEvent"(id,type,"targetId") VALUES(gen_random_uuid(),'EMPLOYEE_ACCOUNT_LINKED',target);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION nolt_private.link_employee_auth() FROM PUBLIC,anon,authenticated,service_role,nolt_app;
DROP TRIGGER IF EXISTS nolt_employee_auth_link ON auth.users;
CREATE TRIGGER nolt_employee_auth_link AFTER INSERT OR UPDATE OF email,email_confirmed_at ON auth.users FOR EACH ROW EXECUTE FUNCTION nolt_private.link_employee_auth();
COMMIT;
