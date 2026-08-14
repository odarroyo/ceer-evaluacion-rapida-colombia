import type { Tag } from "@/lib/domain";

export const DEMO_MUNICIPALITIES = [
  { code: "11001", name: "Bogotá, D.C.", departmentName: "Bogotá, D.C." },
  { code: "05001", name: "Medellín", departmentName: "Antioquia" },
  { code: "76001", name: "Cali", departmentName: "Valle del Cauca" },
  { code: "17001", name: "Manizales", departmentName: "Caldas" },
  { code: "66001", name: "Pereira", departmentName: "Risaralda" },
];

export const DEMO_INSPECTIONS: Array<{
  id: string;
  receiptCode: string;
  buildingName: string;
  location: string;
  submittedAt: string;
  tag: Tag;
  warning?: boolean;
}> = [
  {
    id: "demo-1",
    receiptCode: "CEER-20260812-7F2A10",
    buildingName: "Centro comunitario La Esperanza",
    location: "Bogotá, D.C. · Carrera 18 # 42-16",
    submittedAt: "2026-08-12T14:36:00-05:00",
    tag: "habitable",
  },
  {
    id: "demo-2",
    receiptCode: "CEER-20260812-C91E44",
    buildingName: "Bloque residencial 4",
    location: "Bogotá, D.C. · Calle 63 sur, sector 2",
    submittedAt: "2026-08-12T12:08:00-05:00",
    tag: "uso_restringido",
    warning: true,
  },
];

export const DEMO_BUILDINGS = [
  { id: "demo-building-1", code: "ED-00000041", municipalityCode: "11001", municipalityName: "Bogotá, D.C.", departmentName: "Bogotá, D.C.", name: "Centro comunitario La Esperanza", addressReference: "Carrera 18 # 42-16", lastInspectedAt: "2026-08-12T14:36:00-05:00" },
  { id: "demo-building-2", code: "ED-00000038", municipalityCode: "11001", municipalityName: "Bogotá, D.C.", departmentName: "Bogotá, D.C.", name: "Bloque residencial 4", addressReference: "Calle 63 sur, sector 2", lastInspectedAt: "2026-08-12T12:08:00-05:00" },
  { id: "demo-building-3", code: "ED-00000012", municipalityCode: "17001", municipalityName: "Manizales", departmentName: "Caldas", name: "Escuela Rural El Porvenir", addressReference: "Vereda El Porvenir, junto a la cancha", lastInspectedAt: null },
];
