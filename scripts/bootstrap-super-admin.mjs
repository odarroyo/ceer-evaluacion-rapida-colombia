import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

export function temporaryPassword() {
  return `Atc!${randomBytes(18).toString("base64url")}9a`;
}

export function parseArguments(argumentsList) {
  if (argumentsList.includes("--help")) return { help: true };
  const allowed = new Set(["--email", "--name", "--affiliation"]);
  const parsed = {};
  for (let index = 0; index < argumentsList.length; index += 2) {
    const flag = argumentsList[index];
    const value = argumentsList[index + 1]?.trim();
    if (!allowed.has(flag) || !value) {
      throw new Error(
        "Uso: npm run staging:bootstrap -- --email correo@entidad.gov.co --name \"Nombre completo\" --affiliation \"Entidad\"",
      );
    }
    parsed[flag.slice(2)] = value;
  }
  if (!parsed.email || !parsed.name || !parsed.affiliation) {
    throw new Error(
      "Debe indicar --email, --name y --affiliation para el superadministrador institucional.",
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsed.email)) {
    throw new Error("--email no contiene un correo válido.");
  }
  if (parsed.name.length < 2 || parsed.affiliation.length < 2) {
    throw new Error("El nombre y la afiliación deben tener al menos 2 caracteres.");
  }
  return parsed;
}

export function serverConfiguration(environment = process.env) {
  const url = environment.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secretKey =
    environment.SUPABASE_SECRET_KEY?.trim() ||
    environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const missing = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!secretKey) missing.push("SUPABASE_SECRET_KEY");
  if (missing.length) {
    throw new Error(`Faltan variables requeridas: ${missing.join(", ")}.`);
  }
  return { url, secretKey };
}

export async function bootstrapSuperAdmin({ client, email, name, affiliation }) {
  const { data: privilegedProfiles, error: profileLookupError } = await client
    .from("profiles")
    .select("id,role")
    .in("role", ["coordinator", "super_admin"])
    .limit(1);
  if (profileLookupError) {
    throw new Error(
      "No fue posible consultar perfiles. Confirme que la migración ya fue aplicada.",
    );
  }
  if (privilegedProfiles?.length) {
    throw new Error(
      "Bootstrap rechazado: ya existe una persona coordinadora o superadministradora.",
    );
  }

  const password = temporaryPassword();
  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: name,
      affiliation,
      role: "super_admin",
      must_change_password: true,
    },
  });
  if (error || !data.user) {
    throw new Error("No fue posible crear el superadministrador institucional.");
  }

  const { data: profile, error: verificationError } = await client
    .from("profiles")
    .select("role,must_change_password")
    .eq("id", data.user.id)
    .single();
  if (
    verificationError ||
    profile?.role !== "super_admin" ||
    profile?.must_change_password !== true
  ) {
    await client.auth.admin.deleteUser(data.user.id);
    throw new Error(
      "La cuenta no quedó protegida para cambio obligatorio; se revirtió su creación.",
    );
  }

  return { email, password };
}

function printHelp() {
  console.log(
    "Crea el primer superadministrador una sola vez. Requiere .env.local y rechaza la operación si ya existe un rol privilegiado.\n\n" +
      "npm run staging:bootstrap -- --email correo@entidad.gov.co --name \"Nombre completo\" --affiliation \"Entidad\"",
  );
}

async function main() {
  const argumentsParsed = parseArguments(process.argv.slice(2));
  if (argumentsParsed.help) {
    printHelp();
    return;
  }
  const { url, secretKey } = serverConfiguration();
  const client = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const result = await bootstrapSuperAdmin({ client, ...argumentsParsed });
  console.log("Superadministrador institucional creado.");
  console.log(`Correo: ${result.email}`);
  console.log(`Contraseña temporal (se muestra una sola vez): ${result.password}`);
  console.log("El primer ingreso exigirá reemplazarla antes de abrir la aplicación.");
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Bootstrap fallido.");
    process.exitCode = 1;
  });
}
