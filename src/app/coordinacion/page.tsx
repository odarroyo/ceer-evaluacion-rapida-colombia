import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { TagBadge } from "@/components/tag-badge";
import { requireCoordinator } from "@/lib/auth";
import { DEMO_INSPECTIONS } from "@/lib/demo-data";
import { isSupabaseConfigured } from "@/lib/environment";
import { createClient } from "@/lib/supabase/server";
import type { Tag } from "@/lib/domain";

export const dynamic = "force-dynamic";

async function loadCoordinatorData() {
  if (!isSupabaseConfigured()) return { inspections: DEMO_INSPECTIONS, pending: 2, inspectors: 86 };
  const supabase = await createClient();
  const [inspectionResult, proposalResult, profileResult] = await Promise.all([
    supabase.from("inspections").select("id,receipt_code,submitted_at,confirmed_tag,has_unassessed_warning,buildings(name,address_reference,municipalities(name))").order("submitted_at", { ascending: false }).limit(100),
    supabase.from("building_change_proposals").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "inspector").eq("active", true),
  ]);
  return {
    pending: proposalResult.count ?? 0,
    inspectors: profileResult.count ?? 0,
    inspections: (inspectionResult.data ?? []).map((row) => {
      const building = Array.isArray(row.buildings) ? row.buildings[0] : row.buildings;
      const municipalityRaw = building?.municipalities;
      const municipality = Array.isArray(municipalityRaw) ? municipalityRaw[0] : municipalityRaw;
      return { id: row.id, receiptCode: row.receipt_code, submittedAt: row.submitted_at, tag: row.confirmed_tag as Tag, warning: row.has_unassessed_warning, buildingName: building?.name || "Edificación sin nombre", location: `${municipality?.name ?? "Municipio"} · ${building?.address_reference ?? "Sin referencia"}` };
    }),
  };
}

export default async function CoordinationPage() {
  const profile = await requireCoordinator();
  const data = await loadCoordinatorData();
  return <AppShell profile={profile}>
    <div className="page-heading"><div><p className="eyebrow">Panel de coordinación</p><h1>Operación y control</h1><p>Revise registros, gestione equipos y mantenga la trazabilidad.</p></div><a href="/api/exports/inspections" className="button button-primary">Exportar XLSX</a></div>
    <section className="metric-strip coordinator-metrics"><div><strong>{data.inspections.length}</strong><span>Registros recientes</span></div><div><strong>{data.pending}</strong><span>Cambios pendientes</span></div><div><strong>{data.inspectors}</strong><span>Inspectores activos</span></div></section>
    <div className="action-grid"><Link href="/coordinacion/importar"><span>↥</span><strong>Importar Excel</strong><small>Validación atómica por lote</small></Link><Link href="/coordinacion/inspectores"><span>◎</span><strong>Administrar inspectores</strong><small>Cuentas y carga de roster</small></Link><Link href="/coordinacion/propuestas"><span>◇</span><strong>Cambios de edificación</strong><small>{data.pending} por revisar</small></Link><a href="/api/exports/inspections"><span>↓</span><strong>Exportar registros</strong><small>XLSX filtrable y UTF-8</small></a></div>
    <section className="section-card"><div className="section-title"><div><h2>Registros recientes</h2><p>Las correcciones y anulaciones requieren motivo y quedan auditadas.</p></div></div><div className="record-table"><div className="record-head"><span>Recibo</span><span>Edificación</span><span>Fecha</span><span>Resultado</span><span /></div>{data.inspections.map((item) => <div className="record-row" key={item.id}><code>{item.receiptCode}</code><div><strong>{item.buildingName}</strong><small>{item.location}</small></div><span>{new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.submittedAt))}</span><TagBadge tag={item.tag} /><Link href={`/coordinacion/inspecciones/${item.id}`}>Revisar</Link></div>)}</div></section>
  </AppShell>;
}
