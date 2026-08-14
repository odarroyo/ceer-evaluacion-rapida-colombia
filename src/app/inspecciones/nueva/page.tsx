import { AppShell } from "@/components/app-shell";
import { RapidInspectionForm } from "@/components/rapid-inspection-form";
import { requireProfile } from "@/lib/auth";
import { DEMO_MUNICIPALITIES } from "@/lib/demo-data";
import { getAppMode, isSupabaseConfigured } from "@/lib/environment";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function loadMunicipalities() {
  if (!isSupabaseConfigured()) return DEMO_MUNICIPALITIES;
  const supabase = await createClient();
  const { data } = await supabase.from("municipalities").select("code,name,department_name").order("department_name").order("name");
  return (data ?? []).map((item) => ({ code: item.code, name: item.name, departmentName: item.department_name }));
}

export default async function NewInspectionPage({ searchParams }: { searchParams: Promise<{ building?: string }> }) {
  const [profile, municipalities] = await Promise.all([requireProfile(), loadMunicipalities()]);
  const initialBuildingCode = (await searchParams).building ?? "";
  return <AppShell profile={profile}><div className="page-heading compact"><div><p className="eyebrow">Instrumento rápido CEER</p><h1>Nueva evaluación</h1><p>Inspector: {profile.fullName} · {profile.affiliation}</p></div></div><RapidInspectionForm municipalities={municipalities} initialBuildingCode={initialBuildingCode} syntheticStaging={getAppMode() === "staging"} /></AppShell>;
}
