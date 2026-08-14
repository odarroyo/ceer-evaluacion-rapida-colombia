import { AppShell } from "@/components/app-shell";
import { ImportForm } from "@/app/coordinacion/importar/import-form";
import { requireCoordinator } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const profile = await requireCoordinator();
  return <AppShell profile={profile}><div className="page-heading"><div><p className="eyebrow">Carga institucional</p><h1>Importar evaluaciones rápidas</h1><p>El lote completo se acepta o rechaza; los errores señalan fila y columna. El repositorio público no distribuye formularios ni plantillas ATC.</p></div></div><ImportForm /><div className="notice notice-info"><strong>Atribución del lote</strong><span>Todas las filas se atribuyen a la cuenta que carga el archivo. Las fotos no están permitidas en Excel. Use únicamente un libro institucional autorizado.</span></div></AppShell>;
}
