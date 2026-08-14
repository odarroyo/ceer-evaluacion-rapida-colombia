import fs from "node:fs/promises";
import path from "node:path";

const endpoint = new URL(
  "https://geoportal.dane.gov.co/mparcgis/rest/services/Divipola/Serv_DIVIPOLA_MGN_2025/FeatureServer/317/query",
);
endpoint.search = new URLSearchParams({
  where: "1=1",
  outFields: "MPIO_CDPMP,DPTO_CCDGO,DPTO_CNMBRE,MPIO_CNMBRE,MPIO_NANO",
  returnGeometry: "false",
  orderByFields: "MPIO_CDPMP",
  f: "json",
}).toString();

const response = await fetch(endpoint);
if (!response.ok) throw new Error(`DANE DIVIPOLA request failed: ${response.status}`);
const payload = await response.json();
if (!Array.isArray(payload.features) || payload.features.length < 1_000) {
  throw new Error("DANE DIVIPOLA response is missing expected municipalities");
}

const escapeSql = (value) => `'${String(value).replaceAll("'", "''")}'`;
const rows = payload.features.map(({ attributes }) =>
  `(${[
    attributes.MPIO_CDPMP,
    attributes.DPTO_CCDGO,
    attributes.DPTO_CNMBRE,
    attributes.MPIO_CNMBRE,
    attributes.MPIO_NANO,
  ]
    .map(escapeSql)
    .join(", ")})`,
);

const sql = `-- Generated from DANE DIVIPOLA MGN 2025 FeatureServer.\n-- Source: ${endpoint.origin}${endpoint.pathname}\ninsert into public.municipalities (code, department_code, department_name, name, source_year) values\n${rows.join(",\n")}\non conflict (code) do update set\n  department_code = excluded.department_code,\n  department_name = excluded.department_name,\n  name = excluded.name,\n  source_year = excluded.source_year;\n`;

await fs.writeFile(path.resolve("supabase/seed.sql"), sql, "utf8");
console.log(`Wrote ${rows.length} official DIVIPOLA municipalities to supabase/seed.sql`);
