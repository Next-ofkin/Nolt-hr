import assert from "node:assert/strict";
import test from "node:test";
import { inviteEmail, inviteTtlMinutes, lagosTime, ttlWords } from "../apps/api/src/invite-email.js";

test("expiry uses Nigerian time and plain wording", () => {
  assert.equal(lagosTime(new Date("2026-10-21T14:45:00Z")), "Wed, 21 Oct 2026, 3:45 PM (WAT)");
  assert.equal(ttlWords(60), "1 hour");
  assert.equal(ttlWords(1440), "24 hours");
  assert.equal(ttlWords(45), "45 minutes");
});

test("one setting controls every invitation lifetime, within safe bounds", () => {
  assert.equal(inviteTtlMinutes({}), 60);
  assert.equal(inviteTtlMinutes({ INVITATION_TTL_MINUTES: "1440" }), 1440);
  assert.throws(() => inviteTtlMinutes({ INVITATION_TTL_MINUTES: "2880" }));
  assert.throws(() => inviteTtlMinutes({ INVITATION_TTL_MINUTES: "1" }));
  assert.throws(() => inviteTtlMinutes({ INVITATION_TTL_MINUTES: "abc" }));
});

test("each invitation kind has its own wording, escapes input and states the expiry", () => {
  const link = "https://app.example.invalid/hr-invitations/accept?id=1#token_hash=abc&type=invite";
  const expiresAt = new Date("2026-10-21T14:45:00Z");
  const hr = inviteEmail("HR", { name: '<b>Ada</b>', link, expiresAt });
  assert.equal(hr.subject, "You're invited to join NOLT HR");
  assert.doesNotMatch(hr.html, /<b>Ada/);
  assert.match(hr.html, /authenticator/i);
  assert.match(hr.html, /3:45 PM \(WAT\)/);
  assert.match(hr.text, /token_hash=abc/);
  const emp = inviteEmail("EMPLOYEE", { name: "Ada", link, expiresAt });
  assert.match(emp.subject, /onboarding/i);
  const ext = inviteEmail("EXTERNAL", { title: "Guarantor form", link, expiresAt });
  assert.match(ext.html, /Guarantor form/);
  assert.doesNotMatch(ext.text, /authenticator|MFA/i);
});

test("a guarantor email names who asked, shows how to check it is real, and escapes everything", () => {
  const link = "https://hr.example.test/external/accept?id=1#token_hash=abc&type=magiclink";
  const expiresAt = new Date("2026-10-22T19:35:00Z");
  const m = inviteEmail("EXTERNAL", {
    name: "Bola", title: "Guarantor's Form", link, expiresAt, contact: "hr@noltfinance.com",
    requester: { name: "Ada <b>Okoye</b>", jobTitle: "Credit Officer", department: "Operations", role: "GUARANTOR" },
  });
  assert.match(m.subject, /^Ada .* named you as a guarantor - NOLT Finance$/);
  assert.match(m.text, /Ada <b>Okoye<\/b>, who is joining NOLT Finance as Credit Officer in Operations, has named you as a guarantor/);
  assert.match(m.text, /Is this email real\?/);
  assert.match(m.text, /go to hr\.example\.test and nowhere else/);
  assert.match(m.text, /hr@noltfinance\.com/);
  assert.match(m.text, /If you do not know Ada/);
  assert.doesNotMatch(m.html, /<b>Okoye/); // escaped in the HTML version
  const ref = inviteEmail("EXTERNAL", { name: "C", link, expiresAt, requester: { name: "Ada", role: "REFERENCE" } });
  assert.match(ref.subject, /named you as a referee/);
  assert.match(ref.text, /joining NOLT Finance, has named you/);
  // Without the employee details the old wording still works.
  const plain = inviteEmail("EXTERNAL", { title: "Form", link, expiresAt });
  assert.equal(plain.subject, "NOLT Finance has asked you to complete a form");
  assert.doesNotMatch(plain.text, /Is this email real/);
});
