"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCoordinator } from "@/lib/auth";
import { tagSchema } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";

export async function correctInspection(formData: FormData) {
  await requireCoordinator();
  const id = String(formData.get("id") ?? "");
  const confirmed = tagSchema.safeParse(formData.get("confirmedTag"));
  const reason = String(formData.get("reason") ?? "").trim();
  const restrictions = String(formData.get("restrictions") ?? "").trim();
  const overrideReason = String(formData.get("overrideReason") ?? "").trim();
  if (!id || !confirmed.success || !reason) return;
  const supabase = await createClient();
  const { data: inspection } = await supabase.from("inspections").select("questionnaire_snapshot").eq("id", id).single();
  if (!inspection) return;
  const snapshot = { ...inspection.questionnaire_snapshot, resultado: confirmed.data, restricciones: restrictions || null };
  const { error } = await supabase.rpc("correct_inspection", { target_inspection_id: id, replacement_snapshot: snapshot, replacement_confirmed_tag: confirmed.data, replacement_override_reason: overrideReason || null, replacement_restrictions: restrictions || null, correction_reason: reason });
  if (error) redirect(`/coordinacion/inspecciones/${id}?error=correction`);
  revalidatePath(`/coordinacion/inspecciones/${id}`);
  redirect(`/coordinacion/inspecciones/${id}?updated=1`);
}

export async function voidInspection(formData: FormData) {
  await requireCoordinator();
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!id || !reason) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_inspection", { target_inspection_id: id, reason });
  if (error) redirect(`/coordinacion/inspecciones/${id}?error=void`);
  revalidatePath("/coordinacion");
  redirect("/coordinacion");
}
