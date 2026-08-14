import { AppShell } from "@/components/app-shell";
import { ImportForm } from "@/app/coordinacion/importar/import-form";
import { requireProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function InspectorImportPage() {
  const profile = await requireProfile();
  return <AppShell profile={profile}><div className="page-heading"><div><p className="eyebrow">Carga institucional</p><h1>Importar mi libro Excel</h1><p>Las filas se atribuirán a {profile.fullName}. El repositorio público no distribuye formularios ni plantillas ATC; utilice únicamente un libro institucional autorizado que cumpla el contrato de importación documentado.</p></div></div><ImportForm /></AppShell>;
}
