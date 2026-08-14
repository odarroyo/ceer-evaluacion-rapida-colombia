import { createClient } from "@supabase/supabase-js";
import { requireSupabaseConfiguration } from "@/lib/environment";

export function createAdminClient() {
  const { supabase } = requireSupabaseConfiguration();
  return createClient(supabase.url, supabase.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
