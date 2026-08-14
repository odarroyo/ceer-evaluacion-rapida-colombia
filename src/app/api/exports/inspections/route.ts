import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/environment";
import { DEMO_INSPECTIONS } from "@/lib/demo-data";
import { createClient } from "@/lib/supabase/server";
import { operationalLog } from "@/lib/safe-log";
import { getOperatorBranding } from "@/lib/branding";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const branding = getOperatorBranding();
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  if (profile.mustChangePassword) return NextResponse.json({ error: "Debe cambiar su contraseña antes de continuar." }, { status: 403 });
  if (profile.role === "inspector") return NextResponse.json({ error: "Acceso de coordinación requerido." }, { status: 403 });
  const url = new URL(request.url);
  const municipality = url.searchParams.get("municipality");
  const tag = url.searchParams.get("tag");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  let rows: Array<Record<string, unknown>>;
  if (!isSupabaseConfigured()) {
    rows = DEMO_INSPECTIONS.map((item) => ({ receipt_code: item.receiptCode, submitted_at: item.submittedAt, confirmed_tag: item.tag, has_unassessed_warning: Boolean(item.warning), source: "web", form_type: "rapid_ceer", schema_version: 1, inspection_scope: "exterior", municipality_code: "11001", address_reference: item.location.split(" · ").at(-1), suggested_tag: item.tag, override_reason: null, restrictions: null, needs_review: false, buildings: { code: "ED-DEMO", name: item.buildingName }, profiles: { full_name: "María Inspectora", affiliation: branding.operatorName }, inspection_photos: [] }));
  } else {
    const supabase = await createClient();
    let query = supabase.from("inspections").select("receipt_code,submitted_at,field_inspected_at,source,form_type,schema_version,inspection_scope,municipality_code,address_reference,latitude,longitude,gps_accuracy_m,suggested_tag,confirmed_tag,override_reason,restrictions,has_unassessed_warning,needs_review,status,buildings(code,name),profiles!inspections_inspector_id_fkey(full_name,affiliation),inspection_photos(id)").order("submitted_at", { ascending: false });
    if (municipality) query = query.eq("municipality_code", municipality);
    if (tag) query = query.eq("confirmed_tag", tag);
    if (from) query = query.gte("submitted_at", from);
    if (to) query = query.lte("submitted_at", `${to}T23:59:59.999Z`);
    const { data, error } = await query.limit(10_000);
    if (error) return NextResponse.json({ error: "No fue posible preparar la exportación." }, { status: 500 });
    rows = data ?? [];
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = `CEER · ${branding.operatorName}`;
  workbook.company = branding.operatorName;
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Inspecciones", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "recibo", key: "receipt", width: 25 }, { header: "fecha_servidor", key: "submitted", width: 23 },
    { header: "fecha_campo", key: "field", width: 23 }, { header: "fuente", key: "source", width: 12 },
    { header: "formulario", key: "form", width: 18 }, { header: "schema_version", key: "schema", width: 15 },
    { header: "edificacion_codigo", key: "buildingCode", width: 20 }, { header: "edif_nombre", key: "buildingName", width: 30 },
    { header: "municipio_divipola", key: "municipality", width: 19 }, { header: "edif_dir", key: "address", width: 38 },
    { header: "latitud", key: "latitude", width: 15 }, { header: "longitud", key: "longitude", width: 15 },
    { header: "precision_gps_m", key: "accuracy", width: 17 }, { header: "areas", key: "scope", width: 14 },
    { header: "resultado_sugerido", key: "suggested", width: 24 }, { header: "resultado_confirmado", key: "confirmed", width: 24 },
    { header: "motivo_cambio_resultado", key: "override", width: 35 }, { header: "condiciones_acceso", key: "restrictions", width: 40 },
    { header: "advertencia_no_evaluado", key: "warning", width: 25 }, { header: "requiere_revision", key: "review", width: 20 },
    { header: "inspector", key: "inspector", width: 28 }, { header: "afiliacion", key: "affiliation", width: 25 },
    { header: "referencias_fotos", key: "photos", width: 45 }, { header: "estado", key: "status", width: 14 },
  ];
  for (const row of rows) {
    const buildingRaw = row.buildings as Record<string, unknown> | Array<Record<string, unknown>> | null;
    const building = Array.isArray(buildingRaw) ? buildingRaw[0] : buildingRaw;
    const inspectorRaw = row.profiles as Record<string, unknown> | Array<Record<string, unknown>> | null;
    const inspector = Array.isArray(inspectorRaw) ? inspectorRaw[0] : inspectorRaw;
    const photos = (row.inspection_photos as Array<{ id: string }> | null) ?? [];
    sheet.addRow({ receipt: row.receipt_code, submitted: row.submitted_at, field: row.field_inspected_at, source: row.source, form: row.form_type, schema: row.schema_version, buildingCode: building?.code, buildingName: building?.name, municipality: row.municipality_code, address: row.address_reference, latitude: row.latitude, longitude: row.longitude, accuracy: row.gps_accuracy_m, scope: row.inspection_scope, suggested: row.suggested_tag, confirmed: row.confirmed_tag, override: row.override_reason, restrictions: row.restrictions, warning: row.has_unassessed_warning ? "SI" : "NO", review: row.needs_review ? "SI" : "NO", inspector: inspector?.full_name, affiliation: inspector?.affiliation, photos: photos.map((photo) => `FOTO:${photo.id}`).join(" | "), status: row.status ?? "submitted" });
  }
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B3D4B" } };
  sheet.getRow(1).alignment = { vertical: "middle", wrapText: true };
  sheet.autoFilter = { from: "A1", to: "X1" };
  sheet.getColumn("submitted").numFmt = "yyyy-mm-dd hh:mm";
  sheet.getColumn("field").numFmt = "yyyy-mm-dd hh:mm";
  sheet.eachRow((row, rowNumber) => { if (rowNumber > 1) row.alignment = { vertical: "top", wrapText: true }; });
  const buffer = await workbook.xlsx.writeBuffer();
  operationalLog("export.created", { actorId: profile.id, rowCount: rows.length, filters: { municipality, tag, from, to } });
  return new NextResponse(Buffer.from(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="Evaluaciones_CEER_${new Date().toISOString().slice(0, 10)}.xlsx"`, "Cache-Control": "no-store" } });
}
