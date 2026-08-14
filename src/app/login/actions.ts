"use server";

import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/environment";
import { createClient } from "@/lib/supabase/server";

export async function login(_state: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  if (!isSupabaseConfigured()) redirect("/mis-inspecciones");
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Ingrese correo y contraseña." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "No fue posible iniciar sesión. Verifique sus datos." };
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  const { data: profile } = userId
    ? await supabase.from("profiles").select("active").eq("id", userId).maybeSingle()
    : { data: null };
  if (!profile?.active) {
    await supabase.auth.signOut();
    return { error: "La cuenta está inactiva o no está autorizada." };
  }
  redirect("/mis-inspecciones");
}

export async function logout() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
