BEGIN;
ALTER TABLE public."AuthFlow" DROP CONSTRAINT "AuthFlow_kind_check";
ALTER TABLE public."AuthFlow" ADD CONSTRAINT "AuthFlow_kind_check" CHECK(kind IN ('EMAIL_SIGNUP','EMAIL_RECOVERY','MFA','RECOVERY','INVITATION'));
CREATE TABLE public."EmployeeInvitation" (
 id UUID PRIMARY KEY,
 "employeeId" UUID NOT NULL REFERENCES public."Employee"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "requestKey" UUID NOT NULL,
 "requestHash" TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'QUEUED' CHECK(state IN ('QUEUED','SENDING','SENT','FAILED','UNCERTAIN','ACCEPTED','REVOKED','EXPIRED')),
 "requiresPassword" BOOLEAN NOT NULL,
 "createdBy" UUID NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 "expiresAt" TIMESTAMPTZ(3) NOT NULL,
 "sentAt" TIMESTAMPTZ(3), "acceptedAt" TIMESTAMPTZ(3), "revokedAt" TIMESTAMPTZ(3), "acceptedBy" UUID,
 UNIQUE("employeeId","requestKey"), CHECK("expiresAt">"createdAt"),
 CHECK((state='ACCEPTED')=("acceptedAt" IS NOT NULL)),
 CHECK(("acceptedAt" IS NULL)=("acceptedBy" IS NULL))
);
CREATE INDEX "EmployeeInvitation_employeeId_createdAt_idx" ON public."EmployeeInvitation"("employeeId","createdAt");
CREATE UNIQUE INDEX employee_invitation_one_current ON public."EmployeeInvitation"("employeeId") WHERE state IN ('QUEUED','SENDING','SENT','UNCERTAIN');
CREATE TABLE public."InvitationDelivery" (
 id UUID PRIMARY KEY,
 "invitationId" UUID NOT NULL UNIQUE REFERENCES public."EmployeeInvitation"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "outboxId" UUID NOT NULL UNIQUE REFERENCES public."OutboxEvent"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','SENDING','SENT','FAILED','UNCERTAIN','CANCELLED')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0 AND attempts<=5),
 "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(), "leaseUntil" TIMESTAMPTZ(3), "errorCode" TEXT
);
CREATE INDEX "InvitationDelivery_state_availableAt_idx" ON public."InvitationDelivery"(state,"availableAt");
ALTER TABLE public."EmployeeInvitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."InvitationDelivery" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."EmployeeInvitation",public."InvitationDelivery" FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public."EmployeeInvitation",public."InvitationDelivery" TO nolt_app;
GRANT UPDATE("processedAt") ON public."OutboxEvent" TO nolt_app;
CREATE POLICY nolt_backend ON public."EmployeeInvitation" TO nolt_app USING(true) WITH CHECK(true);
CREATE POLICY nolt_backend ON public."InvitationDelivery" TO nolt_app USING(true) WITH CHECK(true);
COMMIT;
