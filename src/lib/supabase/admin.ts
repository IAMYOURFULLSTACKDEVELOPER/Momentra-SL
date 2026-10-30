import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv, serviceRoleKey } from "@/lib/env";

/** Service-role client. Bypasses RLS: only use after verifying authorization in code. Never import from client code. */
export function createAdminClient() {
  return createClient(publicEnv().NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}
