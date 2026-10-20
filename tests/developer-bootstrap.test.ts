import test from "node:test";
import assert from "node:assert/strict";
import { normalizeApprovedEmail, assertEligibleDeveloper } from "../scripts/developer-bootstrap-policy.mjs";

const address = "owner@example.test";
const userId = "c6dbe031-0fbe-4e30-9507-72e45c58d0e2";
const valid = {
  user_id: userId,
  auth_email: address,
  app_email: address,
  email_verified: true,
  has_verified_totp: true,
  identity_linked: true,
  is_active: true,
  role: "EMPLOYEE",
  has_employee_record: false,
};

test("developer bootstrap requires an explicitly approved email and provider subject", () => {
  assert.equal(normalizeApprovedEmail("  OWNER@EXAMPLE.TEST "), address);
  assert.equal(assertEligibleDeveloper(valid, address, userId), userId);
  assert.throws(() => normalizeApprovedEmail("not-an-email"), /approved Developer email/);
  assert.throws(() => assertEligibleDeveloper(valid, address, "wrong-uuid"), /subject differs/);
});

test("developer bootstrap refuses unverified identities and accounts without TOTP", () => {
  for (const [field, value] of [
    ["email_verified", false],
    ["has_verified_totp", false],
    ["identity_linked", false],
    ["is_active", false],
  ]) assert.throws(() => assertEligibleDeveloper({ ...valid, [field]: value }, address, userId));
  assert.throws(() => assertEligibleDeveloper(null, address, userId), /No linked Supabase/);
});

test("developer bootstrap cannot convert existing HR accounts or assigned employees", () => {
  for (const role of ["HR", "DEVELOPER"])
    assert.throws(() => assertEligibleDeveloper({ ...valid, role }, address, userId), /Only an unassigned/);
  assert.throws(() => assertEligibleDeveloper({ ...valid, has_employee_record: true }, address, userId), /Only an unassigned/);
  assert.throws(() => assertEligibleDeveloper({ ...valid, app_email: "another@example.test" }, address, userId), /do not match/);
});
