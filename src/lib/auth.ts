import { cache } from "react";
import { redirect } from "next/navigation";
import { DEMO_INSPECTOR } from "@/lib/constants";
import { isSupabaseConfigured } from "@/lib/environment";
import { createClient } from "@/lib/supabase/server";

export type CurrentProfile = {
  id: string;
  email?: string;
  fullName: string;
  affiliation: string;
  role: "inspector" | "coordinator" | "super_admin";
  mustChangePassword?: boolean;
};

export const getCurrentProfile = cache(async (): Promise<CurrentProfile | null> => {
  if (!isSupabaseConfigured()) return DEMO_INSPECTOR;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,full_name,affiliation,role,must_change_password,active")
    .eq("id", userId)
    .single();
  if (error || !data || !data.active) return null;
  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name,
    affiliation: data.affiliation,
    role: data.role,
    mustChangePassword: data.must_change_password,
  };
});

export async function requireProfile() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.mustChangePassword) redirect("/cambiar-clave");
  return profile;
}

export async function requireSignedInProfile() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return profile;
}

export async function requireCoordinator() {
  const profile = await requireProfile();
  if (profile.role === "inspector") redirect("/mis-inspecciones");
  return profile;
}
