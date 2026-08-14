import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import { requireStagingEnvironment, sessionCookieForProfile, timedFetch } from "./staging-test-session.mjs";

const headers = [
  "fecha_hora_campo", "areas", "municipio_divipola", "building_code", "edif_nombre", "edif_dir",
  "cond_0", "cond_1", "cond_2", "cond_3", "cond_4", "cond_5", "cond_otro_txt",
  "resultado", "motivo_cambio_resultado", "restricciones", "comentarios",
  "constr_madera", "constr_portico_concreto", "constr_muro_delgado", "constr_muro_concreto",
  "constr_mamposteria_no_reforzada", "constr_mamposteria_confinada", "constr_mamposteria_reforzada", "constr_otro",
  "occ_vivienda", "occ_comercial", "occ_historico", "occ_otra_residencial", "occ_oficinas", "occ_escuela",
  "occ_asamblea", "occ_industrial", "occ_otro", "occ_emergencia", "occ_gobierno",
];
const spanishPhrase = "Edificación Ágora — año 2026; restricción: sólo acceso técnico";
const runId = crypto.randomBytes(4).toString("hex");
const address = `SINTÉTICO EXCEL ${runId}`;

function rowValues(overrides = {}) {
  const row = Object.fromEntries(headers.map((header) => [header, ""]));
  Object.assign(row, {
    fecha_hora_campo: new Date().toISOString(),
    areas: "exterior",
    municipio_divipola: "11001",
    edif_nombre: spanishPhrase,
    edif_dir: address,
    cond_0: "menor", cond_1: "menor", cond_2: "menor", cond_3: "moderado", cond_4: "menor", cond_5: "menor",
    resultado: "uso_restringido",
    restricciones: spanishPhrase,
    constr_madera: "NO",
    occ_vivienda: "SI",
    ...overrides,
  });
  return headers.map((header) => row[header]);
}

async function workbookBytes(rows) {
  const workbook = new ExcelJS.Workbook();
  const metadata = workbook.addWorksheet("Metadata");
  metadata.addRows([["workbook_version", "rapid_ceer_xlsx_v1"], ["schema_version", "1"]]);
  const sheet = workbook.addWorksheet("Evaluaciones_Rapidas");
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function uploadWorkbook(baseUrl, cookie, name, bytes) {
  const form = new FormData();
  form.set("workbook", new File([bytes], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const result = await timedFetch(`${baseUrl}/api/imports/rapid`, { method: "POST", headers: { Cookie: cookie }, body: form });
  let json = null;
  try { json = await result.response?.json(); } catch { /* Status and database counts remain authoritative. */ }
  return { status: result.response?.status, json };
}

const { url, publishableKey, secretKey, baseUrl } = requireStagingEnvironment();
const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const [{ data: inspector, error: inspectorError }, { data: coordinator, error: coordinatorError }] = await Promise.all([
  admin.from("profiles").select("id").eq("role", "inspector").eq("active", true).eq("must_change_password", false).limit(1).single(),
  admin.from("profiles").select("id").in("role", ["coordinator", "super_admin"]).eq("active", true).eq("must_change_password", false).limit(1).single(),
]);
if (inspectorError || !inspector) throw inspectorError ?? new Error("No active inspector is available.");
if (coordinatorError || !coordinator) throw coordinatorError ?? new Error("No active coordinator is available.");
const [inspectorCookie, coordinatorCookie] = await Promise.all([
  sessionCookieForProfile(admin, url, publishableKey, inspector.id),
  sessionCookieForProfile(admin, url, publishableKey, coordinator.id),
]);

const validBytes = await workbookBytes([rowValues()]);
const valid = await uploadWorkbook(baseUrl, inspectorCookie, `synthetic-valid-${runId}.xlsx`, validBytes);
const { data: afterValid, error: validCountError } = await admin.from("inspections").select("id").eq("address_reference", address);
if (validCountError) throw validCountError;

const duplicate = await uploadWorkbook(baseUrl, inspectorCookie, `synthetic-duplicate-${runId}.xlsx`, validBytes);
const { data: afterDuplicate, error: duplicateCountError } = await admin.from("inspections").select("id").eq("address_reference", address);
if (duplicateCountError) throw duplicateCountError;

const invalidAddress = `SINTÉTICO EXCEL INVÁLIDO ${runId}`;
const invalidBytes = await workbookBytes([
  rowValues({ edif_dir: invalidAddress, fecha_hora_campo: new Date(Date.now() + 1_000).toISOString() }),
  rowValues({ edif_dir: `${invalidAddress} FILA 2`, fecha_hora_campo: new Date(Date.now() + 2_000).toISOString(), cond_0: "no_evaluado", cond_1: "no_evaluado", cond_2: "no_evaluado", cond_3: "no_evaluado", cond_4: "no_evaluado", cond_5: "no_evaluado", resultado: "habitable", restricciones: "" }),
]);
const invalid = await uploadWorkbook(baseUrl, inspectorCookie, `synthetic-invalid-${runId}.xlsx`, invalidBytes);
const { data: afterInvalid, error: invalidCountError } = await admin.from("inspections").select("id").like("address_reference", `${invalidAddress}%`);
if (invalidCountError) throw invalidCountError;

const exportResult = await timedFetch(`${baseUrl}/api/exports/inspections?municipality=11001`, { headers: { Cookie: coordinatorCookie } });
const exportBytes = exportResult.response ? Buffer.from(await exportResult.response.arrayBuffer()) : Buffer.alloc(0);
const exportedWorkbook = new ExcelJS.Workbook();
if (exportBytes.length) await exportedWorkbook.xlsx.load(exportBytes);
const exportedSheet = exportedWorkbook.getWorksheet("Inspecciones");
const exportedHeaders = new Map();
exportedSheet?.getRow(1).eachCell((cell, column) => exportedHeaders.set(cell.text, column));
let exportedRow = null;
for (let rowNumber = 2; rowNumber <= (exportedSheet?.actualRowCount ?? 0); rowNumber += 1) {
  if (exportedSheet.getRow(rowNumber).getCell(exportedHeaders.get("edif_dir")).text === address) {
    exportedRow = exportedSheet.getRow(rowNumber);
    break;
  }
}
const exportedName = exportedRow?.getCell(exportedHeaders.get("edif_nombre")).text;
const exportedRestrictions = exportedRow?.getCell(exportedHeaders.get("restricciones")).text;
const checks = {
  validWorkbookImportedOneRow: valid.status === 200 && valid.json?.imported === 1 && afterValid?.length === 1,
  exactDuplicateRejectedAtomically: duplicate.status === 422 && afterDuplicate?.length === 1,
  invalidMixedWorkbookRejectedAtomically: invalid.status === 422 && Array.isArray(invalid.json?.report) && afterInvalid?.length === 0,
  coordinatorExportReturnedXlsx: exportResult.response?.status === 200 && exportBytes.length > 0 && Boolean(exportedSheet),
  spanishCharactersRoundTrip: exportedName === spanishPhrase && exportedRestrictions === spanishPhrase,
};
const evidence = {
  status: Object.values(checks).every(Boolean) ? "pass" : "fail",
  recordedAt: new Date().toISOString(),
  runId,
  validImport: { httpStatus: valid.status, imported: valid.json?.imported ?? null, persistedRows: afterValid?.length ?? 0 },
  duplicateImport: { httpStatus: duplicate.status, persistedRowsAfterAttempt: afterDuplicate?.length ?? 0 },
  invalidMixedImport: { httpStatus: invalid.status, reportedIssues: invalid.json?.report?.length ?? 0, persistedRows: afterInvalid?.length ?? 0 },
  export: { httpStatus: exportResult.response?.status ?? null, workbookBytes: exportBytes.length, spanishPhrasePreserved: checks.spanishCharactersRoundTrip },
  checks,
};
const evidenceDirectory = path.resolve("docs/evidence");
await fs.mkdir(evidenceDirectory, { recursive: true });
await fs.writeFile(path.join(evidenceDirectory, `staging-excel-${runId}.json`), `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx", mode: 0o600 });
console.log(JSON.stringify(evidence, null, 2));
if (evidence.status !== "pass") process.exitCode = 1;
