import { describe, expect, it } from "vitest";
import { inspectAppConfiguration } from "@/lib/environment";

const staging = {
  NEXT_PUBLIC_CEER_ENV: "staging",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
  SUPABASE_SECRET_KEY: "server-secret-example",
};

describe("application environment validation", () => {
  it("uses demo mode only when no Supabase values are present", () => {
    expect(inspectAppConfiguration({})).toEqual({
      valid: true,
      mode: "demo",
      supabase: null,
    });
    expect(
      inspectAppConfiguration({ NEXT_PUBLIC_CEER_ENV: "demo" }),
    ).toEqual({ valid: true, mode: "demo", supabase: null });
  });

  it("accepts a complete staging configuration and prefers the new secret", () => {
    expect(
      inspectAppConfiguration({
        ...staging,
        SUPABASE_SERVICE_ROLE_KEY: "legacy-service-role",
      }),
    ).toEqual({
      valid: true,
      mode: "staging",
      supabase: {
        url: staging.NEXT_PUBLIC_SUPABASE_URL,
        publishableKey: staging.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        secretKey: staging.SUPABASE_SECRET_KEY,
        secretKeySource: "SUPABASE_SECRET_KEY",
      },
    });
  });

  it("temporarily accepts the legacy service-role key", () => {
    const configuration = inspectAppConfiguration({
      ...staging,
      SUPABASE_SECRET_KEY: undefined,
      SUPABASE_SERVICE_ROLE_KEY: "legacy-service-role",
    });
    expect(configuration.valid).toBe(true);
    if (configuration.valid && configuration.mode !== "demo") {
      expect(configuration.supabase.secretKeySource).toBe(
        "SUPABASE_SERVICE_ROLE_KEY",
      );
    }
  });

  it("rejects partial credentials instead of silently using demo mode", () => {
    const configuration = inspectAppConfiguration({
      NEXT_PUBLIC_SUPABASE_URL: staging.NEXT_PUBLIC_SUPABASE_URL,
    });
    expect(configuration.valid).toBe(false);
    if (!configuration.valid) {
      expect(configuration.issues.join(" ")).toContain(
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      );
      expect(configuration.issues.join(" ")).toContain(
        "NEXT_PUBLIC_CEER_ENV",
      );
      expect(configuration.issues.join(" ")).toContain(
        "SUPABASE_SECRET_KEY",
      );
    }
  });

  it("rejects credentials in demo mode and malformed URLs", () => {
    const configuration = inspectAppConfiguration({
      ...staging,
      NEXT_PUBLIC_CEER_ENV: "demo",
      NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
    });
    expect(configuration.valid).toBe(false);
    if (!configuration.valid) {
      expect(configuration.issues.join(" ")).toContain(
        "no puede combinarse",
      );
      expect(configuration.issues.join(" ")).toContain("URL HTTP(S) válida");
    }
  });
});
