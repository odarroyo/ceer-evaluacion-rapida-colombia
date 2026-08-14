import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseRapidWorkbook, RAPID_HEADERS, RAPID_SHEET_NAME, RAPID_WORKBOOK_VERSION } from "@/lib/excel-contract";

async function workbookBuffer(rows: string[][], mutateMetadata?: (sheet: ExcelJS.Worksheet) => void) {
  const workbook = new ExcelJS.Workbook();
  const metadata = workbook.addWorksheet("Metadata");
  metadata.addRows([["workbook_version", RAPID_WORKBOOK_VERSION], ["schema_version", "1"]]);
  mutateMetadata?.(metadata);
  const sheet = workbook.addWorksheet(RAPID_SHEET_NAME);
  sheet.addRow([...RAPID_HEADERS]);
  rows.forEach((row) => sheet.addRow(row));
  const buffer = await workbook.xlsx.writeBuffer();
  const bytes = buffer as unknown as Uint8Array;
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function validRow() {
  const values = Object.fromEntries(RAPID_HEADERS.map((header) => [header, ""]));
  Object.assign(values, {
    fecha_hora_campo: "2026-08-12T08:30:00-05:00",
    areas: "exterior",
    municipio_divipola: "11001",
    edif_nombre: "Edificio Ágora",
    edif_dir: "Carrera 1 # 2-3",
    cond_0: "menor", cond_1: "menor", cond_2: "menor", cond_3: "menor", cond_4: "menor", cond_5: "menor",
    resultado: "habitable",
    constr_madera: "NO",
    occ_vivienda: "SI",
  });
  return RAPID_HEADERS.map((header) => values[header]);
}

describe("rapid Excel import contract", () => {
  it("parses a valid workbook and preserves source keys", async () => {
    const parsed = await parseRapidWorkbook(await workbookBuffer([validRow()]));
    expect(parsed.issues).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].snapshot).toMatchObject({ cond_0: "menor", cond_5: "menor", resultado: "habitable", edif_nombre: "Edificio Ágora", constr_madera: false, occ_vivienda: true });
  });

  it("rejects an incompatible metadata version", async () => {
    const parsed = await parseRapidWorkbook(await workbookBuffer([validRow()], (sheet) => { sheet.getCell("B1").value = "old_version"; }));
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.issues[0].column).toBe("Metadata");
  });

  it("rejects all-unassessed rows", async () => {
    const row = validRow();
    for (let index = 6; index <= 11; index += 1) row[index] = "no_evaluado";
    const parsed = await parseRapidWorkbook(await workbookBuffer([row]));
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.issues.some((issue) => issue.column === "conditions")).toBe(true);
  });

  it("flags an exact duplicate within the same workbook", async () => {
    const row = validRow();
    const parsed = await parseRapidWorkbook(await workbookBuffer([row, [...row]]));
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.issues).toContainEqual({ row: 3, column: "fila", message: "Duplicado exacto dentro del libro." });
  });

  it("round-trips accented Spanish text in XLSX", async () => {
    const source = new ExcelJS.Workbook();
    const sheet = source.addWorksheet("Inspecciones");
    const phrase = "Edificación Ágora — año 2026; restricción: sólo acceso técnico";
    sheet.getCell("A1").value = phrase;
    const bytes = await source.xlsx.writeBuffer();
    const restored = new ExcelJS.Workbook();
    await restored.xlsx.load(bytes);
    expect(restored.getWorksheet("Inspecciones")?.getCell("A1").text).toBe(phrase);
  });
});
