import { getOperatorBranding } from "@/lib/branding";

export const APP_VERSION = "rapid_ceer_v1";
export const RAPID_SCHEMA_VERSION = 1;
export const MAX_PHOTOS = 5;
export const MAX_PHOTO_EDGE = 2048;
export const MAX_IMPORT_ROWS = 1_000;
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export const CONDITION_KEYS = [
  "cond_0",
  "cond_1",
  "cond_2",
  "cond_3",
  "cond_4",
  "cond_5",
] as const;

export const CONDITION_LABELS: Record<(typeof CONDITION_KEYS)[number], string> = {
  cond_0: "Pérdida visible de estabilidad global o de apoyo",
  cond_1: "Inclinación o desplazamiento lateral apreciable del conjunto",
  cond_2: "Deformación o daño relevante en elementos que soportan cargas",
  cond_3: "Elemento elevado o de fachada con posibilidad de desprendimiento",
  cond_4: "Cambio del terreno que pueda comprometer el apoyo de la edificación",
  cond_5: "Situación adicional que pueda afectar la permanencia o el acceso",
};

export const TAG_LABELS = {
  habitable: "Sin restricción observada",
  uso_restringido: "Acceso condicionado",
  peligro_colapso: "No ingresar",
} as const;

export const DEMO_INSPECTOR = {
  id: "00000000-0000-4000-8000-000000000001",
  fullName: "María Inspectora",
  affiliation: `${getOperatorBranding().operatorShortName} · Equipo de campo`,
  role: "inspector" as const,
};
