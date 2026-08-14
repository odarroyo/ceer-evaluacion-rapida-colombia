import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { MAX_IMPORT_BYTES } from "@/lib/constants";
import { isSupabaseConfigured } from "@/lib/environment";
import { parseRapidWorkbook, RAPID_WORKBOOK_VERSION } from "@/lib/excel-contract";
import { createClient } from "@/lib/supabase/server";
import { operationalLog } from "@/lib/safe-log";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  if (profile.mustChangePassword) return NextResponse.json({ error: "Debe cambiar su contraseña antes de continuar." }, { status: 403 });
  const form = await request.formData();
  const file = form.get("workbook");
  if (!(file instanceof File) || !file.name.toLocaleLowerCase("es").endsWith(".xlsx")) return NextResponse.json({ error: "Seleccione un archivo XLSX." }, { status: 400 });
  if (file.size > MAX_IMPORT_BYTES) return NextResponse.json({ error: "El archivo supera 10 MB." }, { status: 413 });
  const parsed = await parseRapidWorkbook(await file.arrayBuffer());
  if (parsed.issues.length || parsed.rows.length === 0) return NextResponse.json({ error: parsed.rows.length === 0 && parsed.issues.length === 0 ? "El libro no contiene filas." : "El libro completo fue rechazado; corrija los errores y vuelva a cargarlo.", report: parsed.issues }, { status: 422 });
  if (!isSupabaseConfigured()) return NextResponse.json({ imported: parsed.rows.length, batchId: crypto.randomUUID(), demo: true });

  const supabase = await createClient();
  const { data: batch, error: batchError } = await supabase.from("import_batches").insert({ uploader_id: profile.id, filename: file.name, workbook_version: RAPID_WORKBOOK_VERSION, schema_version: 1, row_count: parsed.rows.length }).select("id").single();
  if (batchError || !batch) return NextResponse.json({ error: "No se pudo iniciar el lote." }, { status: 500 });
  const { data, error } = await supabase.rpc("import_rapid_batch", { target_batch_id: batch.id, rows: parsed.rows });
  if (error) {
    await supabase.from("import_batches").update({ status: "rejected", validation_report: [{ row: 0, column: "lote", message: error.code === "23505" ? "El lote contiene un duplicado exacto ya registrado." : "El lote no pudo importarse." }], completed_at: new Date().toISOString() }).eq("id", batch.id);
    operationalLog("import.rejected", { batchId: batch.id, uploaderId: profile.id, errorCode: error.code });
    return NextResponse.json({ error: error.code === "23505" ? "El lote contiene un duplicado exacto ya registrado; no se importó ninguna fila." : "No se importó ninguna fila.", batchId: batch.id }, { status: 422 });
  }
  operationalLog("import.completed", { batchId: batch.id, uploaderId: profile.id, rowCount: data });
  return NextResponse.json({ imported: data, batchId: batch.id });
}
