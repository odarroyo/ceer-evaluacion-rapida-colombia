import { AppShell } from "@/components/app-shell";
import { proposeBuildingChange } from "@/app/edificios/[id]/proponer/actions";
import { requireProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ProposeBuildingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ code?: string; name?: string; address?: string }> }) {
  const profile = await requireProfile();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <AppShell profile={profile}><div className="page-heading"><div><p className="eyebrow">Propuesta de dato maestro</p><h1>Solicitar cambio</h1><p>{query.code ?? "Edificación"} · La coordinación revisará antes de modificar el directorio.</p></div></div><form action={proposeBuildingChange} className="section-card admin-form proposal-form"><input type="hidden" name="buildingId" value={id} /><label>Nombre propuesto<input name="name" defaultValue={query.name ?? ""} maxLength={180} /></label><label>Dirección o referencia propuesta<textarea name="address" defaultValue={query.address ?? ""} rows={3} maxLength={500} /></label><label>Motivo y evidencia observada<textarea name="reason" rows={4} maxLength={1000} required /></label><div className="notice notice-info"><strong>No cambia el registro inmediatamente</strong><span>Una persona coordinadora debe aprobar o rechazar esta propuesta; la decisión quedará auditada.</span></div><button className="button button-primary">Enviar propuesta</button></form></AppShell>;
}
