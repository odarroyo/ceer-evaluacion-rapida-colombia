import { AppShell } from "@/components/app-shell";
import { SearchIcon } from "@/components/icons";
import { requireProfile } from "@/lib/auth";
import { DEMO_BUILDINGS } from "@/lib/demo-data";
import { isSupabaseConfigured } from "@/lib/environment";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SearchProps = { searchParams: Promise<{ q?: string }> };
type BuildingDirectoryEntry = {
  id: string;
  code: string;
  municipalityCode: string;
  municipalityName: string;
  departmentName: string;
  name: string;
  addressReference: string;
  lastInspectedAt: string | null;
};

async function searchBuildings(query: string): Promise<BuildingDirectoryEntry[]> {
  if (!isSupabaseConfigured()) {
    const normalized = query.trim().toLocaleLowerCase("es");
    return DEMO_BUILDINGS.filter((item) => !normalized || [item.code, item.name, item.addressReference, item.municipalityName].some((value) => value.toLocaleLowerCase("es").includes(normalized)));
  }
  const supabase = await createClient();
  const { data } = await supabase.rpc("search_building_directory", { search_text: query });
  return (data ?? []).map((item: Record<string, string | null>) => ({ id: item.id ?? "", code: item.code ?? "", municipalityCode: item.municipality_code ?? "", municipalityName: item.municipality_name ?? "", departmentName: item.department_name ?? "", name: item.name || "Edificación sin nombre", addressReference: item.address_reference ?? "", lastInspectedAt: item.last_inspected_at }));
}

export default async function BuildingsPage({ searchParams }: SearchProps) {
  const profile = await requireProfile();
  const query = (await searchParams).q ?? "";
  const buildings = await searchBuildings(query);
  return <AppShell profile={profile}>
    <div className="page-heading"><div><p className="eyebrow">Directorio limitado</p><h1>Buscar edificación</h1><p>Evite duplicados y vincule nuevas visitas al código estable.</p></div></div>
    <form className="search-bar"><SearchIcon /><input name="q" defaultValue={query} placeholder="Código, nombre, dirección o referencia" aria-label="Buscar edificaciones" /><button className="button button-primary">Buscar</button></form>
    <div className="privacy-note"><strong>Vista protegida:</strong> no muestra contactos, coordenadas exactas, fotos ni cuestionarios de otros equipos.</div>
    <section className="section-card"><div className="section-title"><div><h2>{buildings.length} resultado{buildings.length === 1 ? "" : "s"}</h2><p>Máximo 50 coincidencias por consulta.</p></div></div><div className="building-grid">{buildings.map((building) => <article className="building-card" key={building.id}><code>{building.code}</code><h3>{building.name}</h3><p>{building.municipalityName} · {building.departmentName}</p><span>{building.addressReference}</span><dl><dt>Última visita</dt><dd>{building.lastInspectedAt ? new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" }).format(new Date(building.lastInspectedAt)) : "Sin inspecciones"}</dd></dl><div className="building-actions"><a className="button button-secondary button-small" href={`/edificios/${building.id}/proponer?code=${building.code}&name=${encodeURIComponent(building.name)}&address=${encodeURIComponent(building.addressReference)}`}>Proponer cambio</a><a className="button button-primary button-small" href={`/inspecciones/nueva?building=${building.code}`}>Nueva visita</a></div></article>)}</div></section>
  </AppShell>;
}
