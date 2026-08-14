import { createHash, randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { buildReceiptCode, exactDuplicateFingerprint, hasUnassessedCondition, rapidInspectionSchema } from "@/lib/domain";

export const RAPID_WORKBOOK_VERSION = "rapid_ceer_xlsx_v1";
export const RAPID_SHEET_NAME = "Evaluaciones_Rapidas";

export const RAPID_HEADERS = [
  "fecha_hora_campo", "areas", "municipio_divipola", "building_code", "edif_nombre", "edif_dir",
  "cond_0", "cond_1", "cond_2", "cond_3", "cond_4", "cond_5", "cond_otro_txt",
  "resultado", "motivo_cambio_resultado", "restricciones", "comentarios",
  "constr_madera", "constr_portico_concreto", "constr_muro_delgado", "constr_muro_concreto",
  "constr_mamposteria_no_reforzada", "constr_mamposteria_confinada", "constr_mamposteria_reforzada", "constr_otro",
  "occ_vivienda", "occ_comercial", "occ_historico", "occ_otra_residencial", "occ_oficinas", "occ_escuela",
  "occ_asamblea", "occ_industrial", "occ_otro", "occ_emergencia", "occ_gobierno",
] as const;

export type ValidationIssue = { row: number; column: string; message: string };

function cellValue(sheet: ExcelJS.Worksheet, row: number, column: number) {
  const value = sheet.getRow(row).getCell(column).value;
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object" && "text" in value) return String(value.text).trim();
  return String(value ?? "").trim();
}

function normalizeRating(value: string) {
  const normalized = value.toLocaleLowerCase("es").replaceAll(" ", "_");
  const aliases: Record<string, string> = { "menor/ninguno": "menor", "menor_o_ninguno": "menor", "no_evaluado": "no_evaluado", "n/e": "no_evaluado" };
  return aliases[normalized] ?? normalized;
}

function normalizeTag(value: string) {
  const normalized = value.toLocaleLowerCase("es").replaceAll(" ", "_");
  const aliases: Record<string, string> = { "peligro_de_colapso": "peligro_colapso" };
  return aliases[normalized] ?? normalized;
}

export async function parseRapidWorkbook(buffer: ArrayBuffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const metadata = workbook.getWorksheet("Metadata");
  const sheet = workbook.getWorksheet(RAPID_SHEET_NAME);
  const issues: ValidationIssue[] = [];
  if (!sheet) return { rows: [], issues: [{ row: 0, column: RAPID_SHEET_NAME, message: "Falta la hoja requerida." }] };
  if (!metadata || metadata.getCell("B1").text !== RAPID_WORKBOOK_VERSION || metadata.getCell("B2").text !== "1") {
    return { rows: [], issues: [{ row: 0, column: "Metadata", message: "Versión de libro institucional no compatible." }] };
  }
  const headerMap = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, column) => headerMap.set(cell.text.trim(), column));
  for (const header of RAPID_HEADERS.slice(0, 17)) if (!headerMap.has(header)) issues.push({ row: 1, column: header, message: "Falta la columna requerida." });
  if (issues.length) return { rows: [], issues };

  const rows: Array<Record<string, unknown>> = [];
  const fingerprints = new Set<string>();
  for (let rowNumber = 2; rowNumber <= sheet.actualRowCount; rowNumber += 1) {
    const get = (header: string) => cellValue(sheet, rowNumber, headerMap.get(header) ?? 0);
    if (RAPID_HEADERS.every((header) => !get(header))) continue;
    const conditions = Object.fromEntries(Array.from({ length: 6 }, (_, index) => [`cond_${index}`, normalizeRating(get(`cond_${index}`))]));
    const fieldInspectedAt = get("fecha_hora_campo");
    const candidate = {
      clientSubmissionId: randomUUID(), formType: "rapid_ceer" as const, schemaVersion: 1 as const, source: "excel" as const,
      fieldInspectedAt: fieldInspectedAt && !Number.isNaN(Date.parse(fieldInspectedAt)) ? new Date(fieldInspectedAt).toISOString() : fieldInspectedAt,
      inspectionScope: get("areas"), municipalityCode: get("municipio_divipola"), addressReference: get("edif_dir"),
      buildingCode: get("building_code") || undefined, buildingName: get("edif_nombre") || undefined,
      conditions, conditionOtherText: get("cond_otro_txt") || undefined,
      confirmedTag: normalizeTag(get("resultado")), overrideReason: get("motivo_cambio_resultado") || undefined,
      restrictions: get("restricciones") || undefined, comments: get("comentarios") || undefined, detailedEvaluation: [],
    };
    const parsed = rapidInspectionSchema.safeParse(candidate);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) issues.push({ row: rowNumber, column: String(issue.path[0] ?? "fila"), message: issue.message });
      continue;
    }
    const fingerprint = createHash("sha256").update(exactDuplicateFingerprint(parsed.data)).digest("hex");
    if (fingerprints.has(fingerprint)) {
      issues.push({ row: rowNumber, column: "fila", message: "Duplicado exacto dentro del libro." });
      continue;
    }
    fingerprints.add(fingerprint);
    const checkboxSnapshot = Object.fromEntries(RAPID_HEADERS.slice(17).map((header) => [header, get(header).toLocaleUpperCase("es") === "SI"]));
    rows.push({
      receipt_code: buildReceiptCode(), client_submission_id: parsed.data.clientSubmissionId,
      building_code: parsed.data.buildingCode ?? "", building_name: parsed.data.buildingName ?? "",
      municipality_code: parsed.data.municipalityCode, address_reference: parsed.data.addressReference,
      inspection_scope: parsed.data.inspectionScope, field_inspected_at: parsed.data.fieldInspectedAt,
      confirmed_tag: parsed.data.confirmedTag, override_reason: parsed.data.overrideReason ?? "", restrictions: parsed.data.restrictions ?? "",
      has_unassessed_warning: hasUnassessedCondition(parsed.data.conditions), duplicate_fingerprint: fingerprint,
      snapshot: { form_type: "rapid_ceer", schema_version: 1, inspection_scope: parsed.data.inspectionScope, edif_nombre: parsed.data.buildingName ?? null, edif_dir: parsed.data.addressReference, conditions: parsed.data.conditions, ...parsed.data.conditions, cond_otro_txt: parsed.data.conditionOtherText ?? null, resultado: parsed.data.confirmedTag, restricciones: parsed.data.restrictions ?? null, comentarios: parsed.data.comments ?? null, ...checkboxSnapshot },
    });
  }
  if (rows.length > 1_000) issues.push({ row: 0, column: "archivo", message: "El libro supera el máximo de 1.000 filas." });
  return { rows, issues };
}
