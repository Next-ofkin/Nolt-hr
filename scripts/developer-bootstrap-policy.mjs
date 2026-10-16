// Pure guards shared by the offline bootstrap command and its denial tests.
// Neither a verified email alone nor a requested role is sufficient for promotion.
export function normalizeApprovedEmail(input) {
  if (typeof input !== "string") throw new Error("An approved Developer email is required.");
  const value = input.trim().toLowerCase();
  if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    throw new Error("An approved Developer email is required.");
  return value;
}

export function assertEligibleDeveloper(row, approvedEmail, expectedSubject) {
  if (!row) throw new Error("No linked Supabase account exists for that approved email.");
  if (
    row.auth_email?.toLowerCase() !== approvedEmail ||
    row.app_email?.toLowerCase() !== approvedEmail
  ) throw new Error("Supabase and NOLT HR account emails do not match.");
  if (expectedSubject && row.user_id !== expectedSubject)
    throw new Error("Provider subject differs from the explicitly approved user ID.");
  if (!row.email_verified) throw new Error("Supabase email confirmation is required.");
  if (!row.has_verified_totp) throw new Error("A verified TOTP authenticator is required.");
  if (!row.identity_linked) throw new Error("The existing Supabase identity link is missing.");
  if (!row.is_active) throw new Error("The NOLT HR account is disabled.");
  if (row.role !== "EMPLOYEE" || row.has_employee_record)
    throw new Error("Only an unassigned, non-HR account can become the initial Developer.");
  return row.user_id;
}
