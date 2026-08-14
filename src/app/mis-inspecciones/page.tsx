import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PlusIcon, SearchIcon } from "@/components/icons";
import { TagBadge } from "@/components/tag-badge";
import { requireProfile } from "@/lib/auth";
import { DEMO_INSPECTIONS } from "@/lib/demo-data";
import { isSupabaseConfigured } from "@/lib/environment";
import { createClient } from "@/lib/supabase/server";
import type { Tag } from "@/lib/domain";

export const dynamic = "force-dynamic";

async function loadInspections(profileId: string) {
  if (!isSupabaseConfigured()) return DEMO_INSPECTIONS;
  const supabase = await createClient();
  const { data } = await supabase
    .from("inspections")
    .select("id,receipt_code,submitted_at,confirmed_tag,has_unassessed_warning,buildings(name,address_reference,municipalities(name))")
    .eq("inspector_id", profileId)
    .order("submitted_at", { ascending: false })
    .limit(50);
  return (data ?? []).map((row) => {
    const building = Array.isArray(row.buildings) ? row.buildings[0] : row.buildings;
    const municipalityRaw = building?.municipalities;
    const municipality = Array.isArray(municipalityRaw) ? municipalityRaw[0] : municipalityRaw;
    return {
      id: row.id,
      receiptCode: row.receipt_code,
      buildingName: building?.name || "Edificación sin nombre",
      location: `${municipality?.name ?? "Municipio"} · ${building?.address_reference ?? "Sin referencia"}`,
      submittedAt: row.submitted_at,
      tag: row.confirmed_tag as Tag,
      warning: row.has_unassessed_warning,
    };
  });
}

export default async function MyInspectionsPage() {
  const profile = await requireProfile();
  const inspections = await loadInspections(profile.id);
  const today = inspections.filter((item) => item.submittedAt.slice(0, 10) === new Date().toISOString().slice(0, 10)).length;
  return <AppShell profile={profile}>
    <div className="page-heading"><div><p className="eyebrow">Trabajo de campo</p><h1>Mis inspecciones</h1><p>Consulte sus envíos o inicie una nueva evaluación rápida.</p></div><div className="heading-actions"><Link href="/importar" className="button button-secondary">Importar Excel</Link><Link href="/inspecciones/nueva" className="button button-primary"><PlusIcon /> Nueva evaluación</Link></div></div>
    <section className="metric-strip" aria-label="Resumen"><div><strong>{inspections.length}</strong><span>Inspecciones registradas</span></div><div><strong>{today}</strong><span>Enviadas hoy</span></div><div><strong>{inspections.filter((item) => item.warning).length}</strong><span>Con advertencia</span></div></section>
    <section className="section-card">
      <div className="section-title"><div><h2>Envíos recientes</h2><p>Los datos de ubicación exacta permanecen restringidos.</p></div><Link href="/edificios" className="subtle-link"><SearchIcon /> Buscar edificación</Link></div>
      {inspections.length === 0 ? <div className="empty-state"><PlusIcon /><h3>Aún no hay inspecciones</h3><p>Empiece con la primera evaluación del equipo.</p><Link href="/inspecciones/nueva" className="button button-primary">Nueva evaluación</Link></div> : <div className="inspection-list">{inspections.map((item) => <article className="inspection-row" key={item.id}><div className="inspection-date"><strong>{new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short" }).format(new Date(item.submittedAt))}</strong><span>{new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.submittedAt))}</span></div><div className="inspection-main"><h3>{item.buildingName}</h3><p>{item.location}</p><code>{item.receiptCode}</code></div><div className="inspection-state"><TagBadge tag={item.tag} />{item.warning && <span className="warning-chip">Parcialmente evaluada</span>}</div></article>)}</div>}
    </section>
  </AppShell>;
}
