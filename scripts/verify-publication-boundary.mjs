import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const allowedRootFiles = new Set([
  ".env.example",
  ".gitignore",
  "ATTRIBUTION.md",
  "AGENTS.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "NOTICE",
  "README.md",
  "SECURITY.md",
  "THIRD_PARTY_NOTICES",
  "eslint.config.mjs",
  "next-env.d.ts",
  "next.config.ts",
  "package-lock.json",
  "package.json",
  "tsconfig.json",
  "vercel.json",
  "vitest.config.ts",
]);

const allowedPrefixes = [
  ".github/",
  "docs/",
  "public/",
  "scripts/",
  "src/",
  "supabase/",
  "test-fixtures/",
  "tests/",
];

const forbiddenPaths = [
  /(^|\/)\.env(?!\.example$)/,
  /(^|\/)\.vercel(\/|$)/,
  /(^|\/)supabase\/\.temp(\/|$)/,
  /(^|\/)(outputs?|backups?|certificates?|evidence)(\/|$)/i,
  /(^|\/)public\/templates\/.*\.(?:xls|xlsx|pdf)$/i,
  /(^|\/)logo\.png$/i,
  /\.(?:pem|key|crt|p12)$/i,
];

const textExtensions = new Set([
  "",
  ".css",
  ".json",
  ".js",
  ".md",
  ".mjs",
  ".sql",
  ".toml",
  ".ts",
  ".tsx",
  ".yml",
  ".yaml",
]);

const forbiddenContent = [
  { label: "ruta local de usuario", expression: /\/Users\// },
  { label: "ruta privada de OneDrive", expression: /OneDrive-(?:Personal|Business)/i },
  {
    label: "nombre anterior del producto",
    expression: new RegExp(["ceer", "atc20", "colombia"].join("-"), "i"),
  },
  {
    label: "licencia anterior",
    expression: new RegExp(["AGPL", "3.0", "only"].join("-"), "i"),
  },
  {
    label: "reproducción nominal del formulario ATC",
    expression: new RegExp(
      ["Rapid", "Evaluation", "Safety", "Assessment", "Form"].join(" "),
      "i",
    ),
  },
  {
    label: "marca institucional no autorizada",
    expression: new RegExp(`\\b${["UN", "GRD"].join("")}\\b`),
  },
  { label: "referencia de proyecto Supabase", expression: /https:\/\/[a-z0-9]{15,}\.supabase\.co/i },
];

function trackedFiles() {
  const output = execFileSync("git", ["ls-files", "--cached", "-z"], {
    encoding: "utf8",
  });
  return output.split("\0").filter(Boolean);
}

const failures = [];
const files = trackedFiles();

for (const file of files) {
  const allowed = allowedRootFiles.has(file) || allowedPrefixes.some((prefix) => file.startsWith(prefix));
  if (!allowed) failures.push(`${file}: fuera de la lista permitida`);

  for (const expression of forbiddenPaths) {
    if (expression.test(file)) failures.push(`${file}: ruta excluida`);
  }

  if (!textExtensions.has(path.extname(file).toLowerCase())) continue;
  const content = readFileSync(file, "utf8");
  for (const marker of forbiddenContent) {
    if (marker.expression.test(content)) failures.push(`${file}: contiene ${marker.label}`);
  }
}

if (failures.length > 0) {
  console.error("La frontera de publicación no es válida:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Frontera de publicación válida: ${files.length} archivos versionados.`);
