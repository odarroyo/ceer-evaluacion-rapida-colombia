import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireSupabaseConfiguration } from "@/lib/environment";

export async function createClient() {
  const cookieStore = await cookies();
  const { supabase } = requireSupabaseConfiguration();

  return createServerClient(supabase.url, supabase.publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // A Server Component cannot write cookies; proxy.ts refreshes sessions.
        }
      },
    },
  });
}
