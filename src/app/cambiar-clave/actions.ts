"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

export async function changeInitialPassword(_state: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "La cuenta está inactiva o la sesión venció." };
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  if (password.length < 12) return { error: "Use al menos 12 caracteres." };
  if (password !== confirmation) return { error: "Las contraseñas no coinciden." };
  const supabase = await createClient();
  const { error: passwordError } = await supabase.auth.updateUser({ password });
  if (passwordError) return { error: "No fue posible actualizar la contraseña." };
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { error: "La sesión venció. Ingrese nuevamente." };
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ must_change_password: false }).eq("id", userId);
  if (error) return { error: "La contraseña cambió, pero no se pudo completar la activación. Contacte a coordinación." };
  redirect("/mis-inspecciones");
}
