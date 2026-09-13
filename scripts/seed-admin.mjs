/**
 * Seeds a Supabase admin user.
 *
 * Reads credentials from .env.seed (or the environment):
 *   SUPABASE_URL             — project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (never ship in the client)
 *   SEED_ADMIN_EMAIL         — admin email
 *   SEED_ADMIN_PASSWORD      — admin password
 *
 * Run: npm run db:seed
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;

if (!url || !serviceKey || !email || !password) {
  console.error(
    "Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env.seed or your shell.",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUser() {
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) throw error;
  return data.users.find((u) => u.email === email) ?? null;
}

async function promote(userId) {
  const { error: metaError } = await supabase.auth.admin.updateUserById(
    userId,
    {
      app_metadata: { role: "admin" },
      user_metadata: { full_name: "Admin" },
    },
  );
  if (metaError) throw metaError;

  // Keep the profile + JWT role in sync with the settings above.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", userId);
  if (profileError) throw profileError;
}

let userId;
const existing = await findUser();

if (existing) {
  console.log(`User ${email} already exists — promoting to admin…`);
  await promote(existing.id);
  userId = existing.id;
} else {
  console.log(`Creating admin user ${email}…`);
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "admin" },
    user_metadata: { full_name: "Admin" },
  });
  if (error) throw error;
  // The on_auth_user_created trigger already wrote the profiles row with the admin role.
  userId = data.user.id;
}

console.log(`Done. Admin user id: ${userId}`);
