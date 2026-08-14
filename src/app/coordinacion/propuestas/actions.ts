"use server";

import { revalidatePath } from "next/cache";
import { requireCoordinator } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function reviewProposal(formData: FormData) {
  await requireCoordinator();
  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!id || !["approved", "rejected"].includes(decision)) return;
  const supabase = await createClient();
  await supabase.rpc("review_building_change_proposal", { target_proposal_id: id, decision, note: note || null });
  revalidatePath("/coordinacion/propuestas");
}
