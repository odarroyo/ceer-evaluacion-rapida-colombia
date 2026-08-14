"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/environment";
import { createClient } from "@/lib/supabase/server";

export async function proposeBuildingChange(formData: FormData) {
  const profile = await requireProfile();
  const buildingId = String(formData.get("buildingId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!buildingId || !reason || (!name && !address)) redirect("/edificios?proposal=invalid");
  if (!isSupabaseConfigured()) redirect("/edificios?proposal=demo");
  const supabase = await createClient();
  const { error } = await supabase.from("building_change_proposals").insert({ building_id: buildingId, proposed_by: profile.id, proposed_changes: { ...(name ? { name } : {}), ...(address ? { address_reference: address } : {}) }, reason });
  if (error) redirect("/edificios?proposal=error");
  redirect("/edificios?proposal=sent");
}
