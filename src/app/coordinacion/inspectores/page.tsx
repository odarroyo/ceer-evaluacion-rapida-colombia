import { AppShell } from "@/components/app-shell";
import { InspectorAdmin } from "@/app/coordinacion/inspectores/inspector-admin";
import { requireCoordinator } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function InspectorsPage() {
  const profile = await requireCoordinator();
  return <AppShell profile={profile}><div className="page-heading"><div><p className="eyebrow">Acceso nominal</p><h1>Administrar inspectores</h1><p>El registro público está desactivado; coordinación crea y administra todas las cuentas.</p></div></div><InspectorAdmin currentUserId={profile.id} actorRole={profile.role} /></AppShell>;
}
