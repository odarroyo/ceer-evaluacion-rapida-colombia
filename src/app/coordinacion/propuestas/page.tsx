import { AppShell } from "@/components/app-shell";
import { reviewProposal } from "@/app/coordinacion/propuestas/actions";
import { requireCoordinator } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/environment";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProposalsPage() {
  const profile = await requireCoordinator();
  let proposals: Array<Record<string, unknown>> = [];
  if (isSupabaseConfigured()) { const supabase = await createClient(); const { data } = await supabase.from("building_change_proposals").select("id,proposed_changes,reason,created_at,buildings(code,name,address_reference),profiles!building_change_proposals_proposed_by_fkey(full_name)").eq("status", "pending").order("created_at"); proposals = data ?? []; }
  return <AppShell profile={profile}><div className="page-heading"><div><p className="eyebrow">Datos maestros</p><h1>Cambios de edificación</h1><p>Las propuestas no modifican el directorio hasta recibir aprobación.</p></div></div><div className="proposal-list">{proposals.length === 0 ? <div className="empty-state section-card"><h3>No hay propuestas pendientes</h3><p>Las nuevas solicitudes aparecerán aquí.</p></div> : proposals.map((proposal) => { const buildingRaw = proposal.buildings as Record<string, unknown> | Array<Record<string, unknown>>; const building = Array.isArray(buildingRaw) ? buildingRaw[0] : buildingRaw; const proposerRaw = proposal.profiles as Record<string, unknown> | Array<Record<string, unknown>>; const proposer = Array.isArray(proposerRaw) ? proposerRaw[0] : proposerRaw; return <article className="section-card proposal-card" key={String(proposal.id)}><div><code>{String(building?.code)}</code><h2>{String(building?.name ?? "Edificación sin nombre")}</h2><p>Propuesto por {String(proposer?.full_name)} · {new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" }).format(new Date(String(proposal.created_at)))}</p></div><pre>{JSON.stringify(proposal.proposed_changes, null, 2)}</pre><p><strong>Motivo:</strong> {String(proposal.reason)}</p><form action={reviewProposal}><input type="hidden" name="id" value={String(proposal.id)} /><label>Nota de revisión<input name="note" /></label><div className="proposal-actions"><button name="decision" value="rejected" className="button button-secondary">Rechazar</button><button name="decision" value="approved" className="button button-primary">Aprobar cambio</button></div></form></article>; })}</div></AppShell>;
}
