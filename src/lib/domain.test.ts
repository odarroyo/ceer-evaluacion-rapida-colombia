import { describe, expect, it } from "vitest";
import { CONDITION_KEYS, CONDITION_LABELS, TAG_LABELS } from "@/lib/constants";
import {
  buildReceiptCode,
  classifyConditions,
  exactDuplicateFingerprint,
  hasUnassessedCondition,
  rapidInspectionSchema,
  type ConditionRating,
} from "@/lib/domain";

const base = {
  clientSubmissionId: "305e71b4-59ab-4a1d-a8d0-26b3747d9e5b",
  formType: "rapid_ceer" as const,
  schemaVersion: 1 as const,
  source: "web" as const,
  inspectionScope: "exterior" as const,
  municipalityCode: "11001",
  addressReference: "Carrera 1 # 2-3",
  conditions: {
    cond_0: "menor",
    cond_1: "menor",
    cond_2: "menor",
    cond_3: "menor",
    cond_4: "menor",
    cond_5: "menor",
  } as Record<(typeof CONDITION_KEYS)[number], ConditionRating>,
  confirmedTag: "habitable" as const,
  detailedEvaluation: [],
};

describe("CEER rapid-priority classification", () => {
  it("uses CEER-authored public labels and neutral operational outcomes", () => {
    expect(Object.values(CONDITION_LABELS)).toEqual([
      "Pérdida visible de estabilidad global o de apoyo",
      "Inclinación o desplazamiento lateral apreciable del conjunto",
      "Deformación o daño relevante en elementos que soportan cargas",
      "Elemento elevado o de fachada con posibilidad de desprendimiento",
      "Cambio del terreno que pueda comprometer el apoyo de la edificación",
      "Situación adicional que pueda afectar la permanencia o el acceso",
    ]);
    expect(TAG_LABELS).toEqual({
      habitable: "Sin restricción observada",
      uso_restringido: "Acceso condicionado",
      peligro_colapso: "No ingresar",
    });
  });

  it("verifies all 4^6 condition combinations", () => {
    const ratings: ConditionRating[] = ["menor", "moderado", "severo", "no_evaluado"];
    for (let mask = 0; mask < 4 ** 6; mask += 1) {
      let value = mask;
      const conditions = { ...base.conditions };
      for (const key of CONDITION_KEYS) {
        conditions[key] = ratings[value % 4];
        value = Math.floor(value / 4);
      }
      const values = Object.values(conditions);
      const expected = values.includes("severo")
        ? "peligro_colapso"
        : values.includes("moderado")
          ? "uso_restringido"
          : "habitable";
      expect(classifyConditions(conditions)).toBe(expected);
    }
  });

  it("excludes no_evaluado but reports its presence", () => {
    const conditions = { ...base.conditions, cond_2: "no_evaluado" as const };
    expect(classifyConditions(conditions)).toBe("habitable");
    expect(hasUnassessedCondition(conditions)).toBe(true);
  });
});

describe("rapid inspection validation", () => {
  it("accepts a complete unrestricted web inspection", () => {
    expect(rapidInspectionSchema.safeParse(base).success).toBe(true);
  });

  it("rejects all six conditions as no_evaluado", () => {
    const result = rapidInspectionSchema.safeParse({
      ...base,
      conditions: Object.fromEntries(CONDITION_KEYS.map((key) => [key, "no_evaluado"])),
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.path[0] === "conditions")).toBe(true);
  });

  it("requires manual location when GPS is absent", () => {
    const result = rapidInspectionSchema.safeParse({ ...base, addressReference: "" });
    expect(result.success).toBe(false);
  });

  it("accepts GPS in place of a manual reference", () => {
    const result = rapidInspectionSchema.safeParse({ ...base, addressReference: "", coordinates: { latitude: 4.65, longitude: -74.1, accuracyM: 12 } });
    expect(result.success).toBe(true);
  });

  it("requires a reason for a tag override", () => {
    const result = rapidInspectionSchema.safeParse({ ...base, confirmedTag: "uso_restringido", restrictions: "No ingresar al ala norte" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.path[0] === "overrideReason")).toBe(true);
  });

  it("requires access conditions for conditioned-access and no-entry results", () => {
    const conditions = { ...base.conditions, cond_3: "moderado" as const };
    const result = rapidInspectionSchema.safeParse({ ...base, conditions, confirmedTag: "uso_restringido" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.path[0] === "restrictions")).toBe(true);
  });

  it("requires field date/time for Excel", () => {
    const result = rapidInspectionSchema.safeParse({ ...base, source: "excel" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.path[0] === "fieldInspectedAt")).toBe(true);
  });

  it("requires a description when cond_5 is not menor", () => {
    const conditions = { ...base.conditions, cond_5: "moderado" as const };
    const result = rapidInspectionSchema.safeParse({ ...base, conditions, confirmedTag: "uso_restringido", restrictions: "Aislar", overrideReason: undefined });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.path[0] === "conditionOtherText")).toBe(true);
  });
});

describe("stable identifiers and duplicate fingerprints", () => {
  it("builds a stable receipt format", () => {
    expect(buildReceiptCode(new Date("2026-08-12T17:00:00Z"), "abc123")).toBe("CEER-20260812-ABC123");
  });

  it("normalizes address case in exact duplicate fingerprints", () => {
    const first = rapidInspectionSchema.parse(base);
    const second = rapidInspectionSchema.parse({ ...base, addressReference: "  carrera 1 # 2-3  " });
    expect(exactDuplicateFingerprint(first)).toBe(exactDuplicateFingerprint(second));
  });
});
