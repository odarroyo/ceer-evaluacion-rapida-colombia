import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { buildReceiptCode, classifyConditions, exactDuplicateFingerprint, hasUnassessedCondition, rapidInspectionSchema } from "@/lib/domain";
import { getCurrentProfile } from "@/lib/auth";
import { MAX_PHOTOS } from "@/lib/constants";
import { isSupabaseConfigured } from "@/lib/environment";
import { createAdminClient } from "@/lib/supabase/admin";
import { operationalLog } from "@/lib/safe-log";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "Sesión no válida." }, { status: 401 });
  if (profile.mustChangePassword) return NextResponse.json({ error: "Debe cambiar su contraseña antes de continuar." }, { status: 403 });
  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 }); }
  const rawPayload = form.get("payload");
  if (typeof rawPayload !== "string") return NextResponse.json({ error: "Falta la evaluación." }, { status: 400 });
  let unknownPayload: unknown;
  try { unknownPayload = JSON.parse(rawPayload); } catch { return NextResponse.json({ error: "El formulario no contiene JSON válido." }, { status: 400 }); }
  const parsed = rapidInspectionSchema.safeParse(unknownPayload);
  if (!parsed.success) return NextResponse.json({ error: "Hay campos incompletos o inconsistentes.", issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) }, { status: 422 });
  const input = parsed.data;
  const photos = form.getAll("photos").filter((item): item is File => item instanceof File);
  if (photos.length > MAX_PHOTOS) return NextResponse.json({ error: "Se permiten máximo cinco fotos." }, { status: 422 });
  if (photos.some((photo) => !["image/jpeg", "image/png", "image/webp"].includes(photo.type) || photo.size > 12 * 1024 * 1024)) return NextResponse.json({ error: "Una foto tiene formato o tamaño no permitido." }, { status: 422 });
  let photoMeta: Array<{ width: number; height: number }> = [];
  try { photoMeta = JSON.parse(String(form.get("photoMeta") ?? "[]")); } catch { return NextResponse.json({ error: "Los metadatos de foto no son válidos." }, { status: 422 }); }
  if (photoMeta.length !== photos.length || photoMeta.some(({ width, height }) => width < 1 || height < 1 || width > 2048 || height > 2048)) return NextResponse.json({ error: "Una foto no cumple la resolución máxima de 2048 píxeles." }, { status: 422 });

  const suggestedTag = classifyConditions(input.conditions);
  const warning = hasUnassessedCondition(input.conditions);
  const receiptCode = buildReceiptCode();
  if (!isSupabaseConfigured()) {
    operationalLog("inspection.demo_submitted", { inspectorId: profile.id, receiptCode, tag: input.confirmedTag, photoCount: photos.length });
    return NextResponse.json({ receiptCode, inspectionId: randomUUID(), suggestedTag, confirmedTag: input.confirmedTag, warning, photoCount: photos.length, demo: true });
  }

  let admin;
  try { admin = createAdminClient(); } catch { return NextResponse.json({ error: "El servicio de escritura no está configurado." }, { status: 503 }); }
  const fingerprint = createHash("sha256").update(exactDuplicateFingerprint(input)).digest("hex");
  const { data: retry } = await admin.from("inspections").select("id,receipt_code,suggested_tag,confirmed_tag,has_unassessed_warning").eq("inspector_id", profile.id).eq("client_submission_id", input.clientSubmissionId).maybeSingle();
  if (retry) return NextResponse.json({ receiptCode: retry.receipt_code, inspectionId: retry.id, suggestedTag: retry.suggested_tag, confirmedTag: retry.confirmed_tag, warning: retry.has_unassessed_warning, photoCount: photos.length, retried: true });

  let buildingId: string | undefined;
  let needsReview = false;
  if (input.buildingCode) {
    const { data } = await admin.from("buildings").select("id").eq("code", input.buildingCode).maybeSingle();
    buildingId = data?.id;
    if (!buildingId) return NextResponse.json({ error: "El código de edificación no existe." }, { status: 422 });
  } else {
    const normalizedAddress = input.addressReference.trim();
    if (normalizedAddress) {
      const { data } = await admin.from("buildings").select("id").eq("municipality_code", input.municipalityCode).ilike("address_reference", normalizedAddress).limit(1).maybeSingle();
      buildingId = data?.id;
    }
    if (!buildingId) {
      const { data, error } = await admin.from("buildings").insert({ municipality_code: input.municipalityCode, name: input.buildingName ?? null, address_reference: input.addressReference, latitude: input.coordinates?.latitude ?? null, longitude: input.coordinates?.longitude ?? null, gps_accuracy_m: input.coordinates?.accuracyM ?? null, created_by: profile.id }).select("id").single();
      if (error) return NextResponse.json({ error: "No se pudo registrar la edificación." }, { status: 500 });
      buildingId = data.id;
    }
  }

  const probableDuplicateCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000).toISOString();
  const { data: recentAtBuilding } = await admin
    .from("inspections")
    .select("id")
    .eq("building_id", buildingId)
    .eq("status", "submitted")
    .gte("submitted_at", probableDuplicateCutoff)
    .limit(1);
  needsReview = Boolean(recentAtBuilding?.length);

  const inspectionId = randomUUID();
  const uploadedPaths: string[] = [];
  try {
    for (const photo of photos) {
      const path = `${inspectionId}/${randomUUID()}.jpg`;
      const bytes = await photo.arrayBuffer();
      const { error } = await admin.storage.from("inspection-photos").upload(path, bytes, { contentType: photo.type, upsert: false });
      if (error) throw error;
      uploadedPaths.push(path);
    }

    const questionnaireSnapshot = {
      form_type: input.formType, schema_version: input.schemaVersion, inspection_scope: input.inspectionScope,
      edif_nombre: input.buildingName ?? null, edif_dir: input.addressReference, conditions: input.conditions,
      ...input.conditions, cond_otro_txt: input.conditionOtherText ?? null, resultado: input.confirmedTag,
      restricciones: input.restrictions ?? null, comentarios: input.comments ?? null,
    };
    const { error: inspectionError } = await admin.from("inspections").insert({
      id: inspectionId, receipt_code: receiptCode, client_submission_id: input.clientSubmissionId, building_id: buildingId,
      inspector_id: profile.id, source: "web", form_type: input.formType, schema_version: input.schemaVersion,
      inspection_scope: input.inspectionScope, municipality_code: input.municipalityCode, address_reference: input.addressReference,
      latitude: input.coordinates?.latitude ?? null, longitude: input.coordinates?.longitude ?? null, gps_accuracy_m: input.coordinates?.accuracyM ?? null,
      questionnaire_snapshot: questionnaireSnapshot, suggested_tag: suggestedTag, confirmed_tag: input.confirmedTag,
      override_reason: input.overrideReason ?? null, restrictions: input.restrictions ?? null, has_unassessed_warning: warning,
      duplicate_fingerprint: fingerprint, needs_review: needsReview,
    });
    if (inspectionError) {
      if (inspectionError.code === "23505") throw new Error("Esta evaluación ya fue registrada exactamente.");
      throw inspectionError;
    }
    if (photos.length) {
      const rows = await Promise.all(photos.map(async (photo, index) => ({
        inspection_id: inspectionId, storage_path: uploadedPaths[index], mime_type: photo.type, byte_size: photo.size,
        width: photoMeta[index].width, height: photoMeta[index].height,
        sha256: createHash("sha256").update(Buffer.from(await photo.arrayBuffer())).digest("hex"), created_by: profile.id,
      })));
      const { error } = await admin.from("inspection_photos").insert(rows);
      if (error) throw error;
    }
    operationalLog("inspection.submitted", { inspectionId, inspectorId: profile.id, receiptCode, tag: input.confirmedTag, photoCount: photos.length });
    return NextResponse.json({ receiptCode, inspectionId, suggestedTag, confirmedTag: input.confirmedTag, warning, photoCount: photos.length });
  } catch (caught) {
    if (uploadedPaths.length) await admin.storage.from("inspection-photos").remove(uploadedPaths);
    operationalLog("inspection.submit_failed", { inspectorId: profile.id, clientSubmissionId: input.clientSubmissionId, errorCode: caught instanceof Error ? caught.name : "unknown" });
    return NextResponse.json({ error: caught instanceof Error ? caught.message : "No se pudo guardar la inspección. Reintente." }, { status: 500 });
  }
}
