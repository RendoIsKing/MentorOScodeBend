import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error('SUPABASE_URL is not set. Add it to .env or Railway Variables.');
}
if (!supabaseServiceKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env or Railway Variables.');
}

/**
 * Admin client – uses the service_role key, bypasses RLS.
 * Use this for server-side operations (controllers, services, cron jobs).
 */
export const supabaseAdmin: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Public client – uses the anon key, respects RLS.
 * Use this when you want row-level security to apply (e.g., user-scoped queries).
 *
 * IMPORTANT: persistSession must be false on the server / serverless
 * (Vercel, Railway). Without this, the singleton client stores the session
 * of the LAST signInWithPassword call in memory, which bleeds across
 * requests on the same function instance and causes Google-login failures.
 */
export const supabasePublic: SupabaseClient = createClient(
  supabaseUrl,
  supabaseAnonKey || supabaseServiceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

/**
 * Create a client scoped to a specific user's JWT (for RLS).
 * Pass the user's access_token from Supabase Auth.
 */
export function supabaseForUser(accessToken: string): SupabaseClient {
  return createClient(supabaseUrl!, supabaseAnonKey || supabaseServiceKey!, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export default supabaseAdmin;
