import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { TagBadge } from "@/components/tag-badge";
import { correctInspection, voidInspection } from "@/app/coordinacion/inspecciones/actions";
import { requireCoordinator } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/environment";
import { createClient } from "@/lib/supabase/server";
import type { Tag } from "@/lib/domain";

export const dynamic = "force-dynamic";

export default async function InspectionDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ updated?: string; error?: string }> }) {
  const profile = await requireCoordinator();
  const { id } = await params;
  if (!isSupabaseConfigured()) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("inspections").select("*,buildings(*,municipalities(name,department_name)),profiles!inspections_inspector_id_fkey(full_name,affiliation,email),inspection_photos(id,storage_path,byte_size,width,height),inspection_revisions(revision_number,reason,created_at,profiles!inspection_revisions_revised_by_fkey(full_name))").eq("id", id).single();
  if (!data) notFound();
  const state = await searchParams;
  const buildingRaw = data.buildings; const building = Array.isArray(buildingRaw) ? buildingRaw[0] : buildingRaw;
  const municipalityRaw = building?.municipalities; const municipality = Array.isArray(municipalityRaw) ? municipalityRaw[0] : municipalityRaw;
  const inspectorRaw = data.profiles; const inspector = Array.isArray(inspectorRaw) ? inspectorRaw[0] : inspectorRaw;
  const photos = data.inspection_photos ?? [];
  const signed = photos.length ? await supabase.storage.from("inspection-photos").createSignedUrls(photos.map((photo: { storage_path: string }) => photo.storage_path), 300) : { data: [] };
  return <AppShell profile={profile}><div className="page-heading"><div><p className="eyebrow">Registro coordinador</p><h1>{data.receipt_code}</h1><p>{building?.name || "Edificación sin nombre"} · {building?.code}</p></div><TagBadge tag={data.confirmed_tag as Tag} large /></div>{state.updated && <div className="notice notice-success"><strong>Corrección registrada</strong><span>La revisión y su motivo quedaron en el historial de auditoría.</span></div>}{state.error && <div className="notice notice-danger"><strong>No fue posible completar el cambio</strong><span>Verifique las reglas del resultado, condiciones de acceso y permisos.</span></div>}
    <div className="detail-columns"><section className="section-card detail-card"><h2>Inspección</h2><dl><dt>Inspector</dt><dd>{inspector?.full_name} · {inspector?.affiliation}</dd><dt>Fecha de servidor</dt><dd>{new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeStyle: "short" }).format(new Date(data.submitted_at))}</dd><dt>Fuente / formulario</dt><dd>{data.source} · {data.form_type} · esquema {data.schema_version}</dd><dt>Alcance</dt><dd>{data.inspection_scope}</dd><dt>Sugerencia</dt><dd><TagBadge tag={data.suggested_tag as Tag} /></dd><dt>Confirmación</dt><dd><TagBadge tag={data.confirmed_tag as Tag} /></dd><dt>Restricciones</dt><dd>{data.restrictions || "No aplica"}</dd><dt>Advertencia</dt><dd>{data.has_unassessed_warning ? "Evaluación parcial" : "Todas las condiciones evaluadas"}</dd></dl></section><section className="section-card detail-card sensitive-card"><div className="sensitive-label">Información restringida</div><h2>Ubicación y contacto</h2><dl><dt>Municipio</dt><dd>{municipality?.name} · {municipality?.department_name} · {data.municipality_code}</dd><dt>Dirección/referencia</dt><dd>{data.address_reference}</dd><dt>GPS exacto</dt><dd>{data.latitude ? `${data.latitude}, ${data.longitude} (±${Math.round(data.gps_accuracy_m)} m)` : "No capturado"}</dd><dt>Contacto</dt><dd>{building?.contact || "No registrado"}</dd></dl></section></div>
    {signed.data && signed.data.length > 0 && <section className="section-card"><div className="section-title"><div><h2>Fotos privadas</h2><p>Enlaces firmados por cinco minutos.</p></div></div><div className="private-photo-grid">{signed.data.map((photo, index) => photo.signedUrl && <a href={photo.signedUrl} target="_blank" rel="noreferrer" key={photo.signedUrl}><img src={photo.signedUrl} alt={`Evidencia privada ${index + 1}`} /></a>)}</div></section>}
    <div className="admin-columns"><form action={correctInspection} className="section-card admin-form"><input type="hidden" name="id" value={id} /><h2>Registrar corrección</h2><label>Resultado confirmado<select name="confirmedTag" defaultValue={data.confirmed_tag}><option value="habitable">Sin restricción observada</option><option value="uso_restringido">Acceso condicionado</option><option value="peligro_colapso">No ingresar</option></select></label><label>Motivo del cambio de resultado<input name="overrideReason" defaultValue={data.override_reason ?? ""} /></label><label>Condiciones de acceso<textarea name="restrictions" defaultValue={data.restrictions ?? ""} rows={3} /></label><label>Razón de la corrección<textarea name="reason" rows={3} required /></label><button className="button button-primary">Guardar revisión auditada</button></form><form action={voidInspection} className="section-card admin-form danger-form"><input type="hidden" name="id" value={id} /><h2>Anular registro</h2><p>La anulación no elimina el registro ni su historial.</p><label>Razón de anulación<textarea name="reason" rows={4} required /></label><button className="button button-danger">Anular con auditoría</button></form></div>
  </AppShell>;
}
