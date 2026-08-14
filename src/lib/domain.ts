import { z } from "zod";
import { CONDITION_KEYS, RAPID_SCHEMA_VERSION } from "@/lib/constants";

export const conditionRatingSchema = z.enum([
  "menor",
  "moderado",
  "severo",
  "no_evaluado",
]);
export type ConditionRating = z.infer<typeof conditionRatingSchema>;

export const tagSchema = z.enum([
  "habitable",
  "uso_restringido",
  "peligro_colapso",
]);
export type Tag = z.infer<typeof tagSchema>;

export const inspectionScopeSchema = z.enum(["exterior", "ext_int"]);
export type InspectionScope = z.infer<typeof inspectionScopeSchema>;
export type InspectionSource = "web" | "excel";
export type FormType = "rapid_ceer" | "detailed_ceer";

export const coordinatesSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracyM: z.number().positive().max(100_000),
  })
  .optional();

const conditionsShape = Object.fromEntries(
  CONDITION_KEYS.map((key) => [key, conditionRatingSchema]),
) as Record<(typeof CONDITION_KEYS)[number], typeof conditionRatingSchema>;

export const rapidInspectionSchema = z
  .object({
    clientSubmissionId: z.uuid(),
    formType: z.literal("rapid_ceer").default("rapid_ceer"),
    schemaVersion: z.literal(RAPID_SCHEMA_VERSION).default(RAPID_SCHEMA_VERSION),
    source: z.enum(["web", "excel"]).default("web"),
    fieldInspectedAt: z.iso.datetime().optional(),
    inspectionScope: inspectionScopeSchema,
    municipalityCode: z.string().regex(/^\d{5}$/, "Seleccione un municipio DIVIPOLA."),
    addressReference: z.string().trim().max(500).default(""),
    coordinates: coordinatesSchema,
    buildingCode: z.string().trim().max(30).optional(),
    buildingName: z.string().trim().max(180).optional(),
    buildingContact: z.string().trim().max(180).optional(),
    conditions: z.object(conditionsShape),
    conditionOtherText: z.string().trim().max(500).optional(),
    damageEstimate: z
      .enum(["ninguno", "0_1", "1_10", "10_30", "30_60", "60_100", "100"])
      .optional(),
    confirmedTag: tagSchema,
    overrideReason: z.string().trim().max(1_000).optional(),
    restrictions: z.string().trim().max(2_000).optional(),
    barricades: z.string().trim().max(1_000).optional(),
    detailedEvaluation: z.array(z.enum(["estructural", "geotecnica", "otra"])).default([]),
    recommendations: z.string().trim().max(2_000).optional(),
    comments: z.string().trim().max(4_000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.source === "excel" && !value.fieldInspectedAt) {
      ctx.addIssue({
        code: "custom",
        path: ["fieldInspectedAt"],
        message: "La fecha y hora de campo son obligatorias para filas de Excel.",
      });
    }

    if (!value.addressReference && !value.coordinates) {
      ctx.addIssue({
        code: "custom",
        path: ["addressReference"],
        message: "Ingrese una dirección/referencia o capture el GPS.",
      });
    }

    const ratings = Object.values(value.conditions);
    if (ratings.every((rating) => rating === "no_evaluado")) {
      ctx.addIssue({
        code: "custom",
        path: ["conditions"],
        message: "No es posible dejar las seis condiciones sin evaluar.",
      });
    }

    const suggested = classifyConditions(value.conditions);
    if (suggested !== value.confirmedTag && !value.overrideReason?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["overrideReason"],
        message: "Explique por qué cambia el resultado sugerido.",
      });
    }

    if (value.confirmedTag !== "habitable" && !value.restrictions?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["restrictions"],
        message: "Registre las condiciones de acceso o la prohibición de ingreso.",
      });
    }

    if (
      value.conditions.cond_5 !== "menor" &&
      !value.conditionOtherText?.trim()
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["conditionOtherText"],
        message: "Describa el otro peligro observado.",
      });
    }
  });

export type RapidInspectionInput = z.infer<typeof rapidInspectionSchema>;

export function classifyConditions(
  conditions: Record<string, ConditionRating>,
): Tag {
  const ratings = Object.values(conditions);
  if (ratings.includes("severo")) return "peligro_colapso";
  if (ratings.includes("moderado")) return "uso_restringido";
  return "habitable";
}

export function hasUnassessedCondition(
  conditions: Record<string, ConditionRating>,
) {
  return Object.values(conditions).includes("no_evaluado");
}

export function buildReceiptCode(date = new Date(), suffix?: string) {
  const stamp = date
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");
  const token = (suffix ?? crypto.randomUUID().slice(0, 6)).toUpperCase();
  return `CEER-${stamp}-${token}`;
}

export function exactDuplicateFingerprint(input: RapidInspectionInput) {
  const stable = {
    source: input.source,
    fieldInspectedAt: input.fieldInspectedAt ?? null,
    inspectionScope: input.inspectionScope,
    municipalityCode: input.municipalityCode,
    addressReference: input.addressReference.trim().toLocaleLowerCase("es"),
    coordinates: input.coordinates
      ? {
          latitude: Number(input.coordinates.latitude.toFixed(5)),
          longitude: Number(input.coordinates.longitude.toFixed(5)),
        }
      : null,
    conditions: input.conditions,
    confirmedTag: input.confirmedTag,
  };
  return JSON.stringify(stable);
}
