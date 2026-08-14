export type AppMode = "demo" | "staging" | "production";

type EnvironmentValues = {
  NEXT_PUBLIC_CEER_ENV?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

type DemoConfiguration = {
  valid: true;
  mode: "demo";
  supabase: null;
};

type SupabaseConfiguration = {
  valid: true;
  mode: "staging" | "production";
  supabase: {
    url: string;
    publishableKey: string;
    secretKey: string;
    secretKeySource: "SUPABASE_SECRET_KEY" | "SUPABASE_SERVICE_ROLE_KEY";
  };
};

export type ValidAppConfiguration = DemoConfiguration | SupabaseConfiguration;

export type InvalidAppConfiguration = {
  valid: false;
  mode: AppMode | "invalid";
  issues: string[];
};

export type AppConfiguration = ValidAppConfiguration | InvalidAppConfiguration;

export class ConfigurationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Configuración incompleta: ${issues.join(" ")}`);
    this.name = "ConfigurationError";
    this.issues = issues;
  }
}

function currentEnvironment(): EnvironmentValues {
  // Keep these accesses explicit so Next.js can inline only NEXT_PUBLIC_ values
  // in browser bundles. Server secrets never receive a public prefix.
  return {
    NEXT_PUBLIC_CEER_ENV: process.env.NEXT_PUBLIC_CEER_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

function normalized(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function inspectAppConfiguration(
  values: EnvironmentValues = currentEnvironment(),
): AppConfiguration {
  const requestedMode = normalized(values.NEXT_PUBLIC_CEER_ENV);
  const url = normalized(values.NEXT_PUBLIC_SUPABASE_URL);
  const publishableKey = normalized(
    values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  const preferredSecret = normalized(values.SUPABASE_SECRET_KEY);
  const legacySecret = normalized(values.SUPABASE_SERVICE_ROLE_KEY);
  const secretKey = preferredSecret ?? legacySecret;
  const hasAnySupabaseValue = Boolean(
    url || publishableKey || preferredSecret || legacySecret,
  );

  if (!requestedMode && !hasAnySupabaseValue) {
    return { valid: true, mode: "demo", supabase: null };
  }
  if (requestedMode === "demo" && !hasAnySupabaseValue) {
    return { valid: true, mode: "demo", supabase: null };
  }

  const issues: string[] = [];
  if (!requestedMode) {
    issues.push(
      "Defina NEXT_PUBLIC_CEER_ENV como staging o production cuando configure Supabase.",
    );
  } else if (!["demo", "staging", "production"].includes(requestedMode)) {
    issues.push(
      "NEXT_PUBLIC_CEER_ENV debe ser demo, staging o production.",
    );
  } else if (requestedMode === "demo") {
    issues.push(
      "NEXT_PUBLIC_CEER_ENV=demo no puede combinarse con credenciales de Supabase.",
    );
  }

  if (!url) issues.push("Falta NEXT_PUBLIC_SUPABASE_URL.");
  if (!publishableKey) {
    issues.push("Falta NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }
  if (!secretKey) {
    issues.push(
      "Falta SUPABASE_SECRET_KEY (o SUPABASE_SERVICE_ROLE_KEY durante la transición).",
    );
  }
  if (url) {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    } catch {
      issues.push("NEXT_PUBLIC_SUPABASE_URL no es una URL HTTP(S) válida.");
    }
  }

  const knownMode = ["demo", "staging", "production"].includes(
    requestedMode ?? "",
  )
    ? (requestedMode as AppMode)
    : "invalid";
  if (issues.length || knownMode === "demo" || knownMode === "invalid") {
    return { valid: false, mode: knownMode, issues };
  }

  return {
    valid: true,
    mode: knownMode,
    supabase: {
      url: url!,
      publishableKey: publishableKey!,
      secretKey: secretKey!,
      secretKeySource: preferredSecret
        ? "SUPABASE_SECRET_KEY"
        : "SUPABASE_SERVICE_ROLE_KEY",
    },
  };
}

export function requireAppConfiguration(): ValidAppConfiguration {
  const configuration = inspectAppConfiguration();
  if (!configuration.valid) throw new ConfigurationError(configuration.issues);
  return configuration;
}

export function isSupabaseConfigured() {
  return requireAppConfiguration().mode !== "demo";
}

export function getAppMode(): AppMode {
  return requireAppConfiguration().mode;
}

export function requireSupabaseConfiguration(): SupabaseConfiguration {
  const configuration = requireAppConfiguration();
  if (configuration.mode === "demo") {
    throw new ConfigurationError([
      "Supabase no está configurado en el modo demostración.",
    ]);
  }
  return configuration;
}
