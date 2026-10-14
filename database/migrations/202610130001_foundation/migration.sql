CREATE TABLE "User" (
 "id" UUID PRIMARY KEY, "email" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL,
 "role" TEXT NOT NULL CHECK ("role" IN ('HR','EMPLOYEE')), "active" BOOLEAN NOT NULL DEFAULT true,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "Session" (
 "id" UUID PRIMARY KEY, "tokenHash" TEXT NOT NULL UNIQUE, "csrfHash" TEXT NOT NULL,
 "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "expiresAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE TABLE "Form" (
 "id" UUID PRIMARY KEY, "createdBy" UUID NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Form_createdAt_idx" ON "Form"("createdAt");
CREATE TABLE "FormVersion" (
 "id" UUID PRIMARY KEY, "formId" UUID NOT NULL REFERENCES "Form"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "version" INTEGER NOT NULL CHECK ("version">0), "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision">0),
 "status" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT','PUBLISHED')),
 "title" TEXT NOT NULL, "description" TEXT NOT NULL DEFAULT '',
 "recipient" TEXT NOT NULL CHECK ("recipient" IN ('EMPLOYEE','GUARANTOR','REFERENCE')),
 "fields" JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof("fields")='array'),
 "publishedAt" TIMESTAMPTZ(3), "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "FormVersion_formId_version_key" UNIQUE ("formId","version"),
 CONSTRAINT "published_evidence" CHECK (("status"='DRAFT' AND "publishedAt" IS NULL) OR ("status"='PUBLISHED' AND "publishedAt" IS NOT NULL))
);
CREATE INDEX "FormVersion_status_updatedAt_idx" ON "FormVersion"("status","updatedAt");
CREATE TABLE "AuditEvent" (
 "id" UUID PRIMARY KEY, "actorId" UUID NOT NULL, "action" TEXT NOT NULL, "targetId" UUID NOT NULL,
 "metadata" JSONB NOT NULL DEFAULT '{}', "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AuditEvent_targetId_createdAt_idx" ON "AuditEvent"("targetId","createdAt");
CREATE TABLE "OutboxEvent" (
 "id" UUID PRIMARY KEY, "type" TEXT NOT NULL, "targetId" UUID NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "processedAt" TIMESTAMPTZ(3)
);
CREATE INDEX "OutboxEvent_processedAt_createdAt_idx" ON "OutboxEvent"("processedAt","createdAt");

-- Defence in depth: published content cannot be rewritten even via a runtime SQL bug.
CREATE FUNCTION protect_published_form() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."status"='PUBLISHED' THEN RAISE EXCEPTION 'Published form versions are immutable'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER form_version_immutable BEFORE UPDATE OR DELETE ON "FormVersion"
FOR EACH ROW EXECUTE FUNCTION protect_published_form();
