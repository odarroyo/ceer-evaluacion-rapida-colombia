import { describe, expect, it } from "vitest";
import {
  bootstrapSuperAdmin,
  parseArguments,
  serverConfiguration,
  temporaryPassword,
} from "./bootstrap-super-admin.mjs";

function queryResult(result) {
  const query = {
    select: () => query,
    in: () => query,
    limit: async () => result,
    eq: () => query,
    single: async () => result,
  };
  return query;
}

describe("super-administrator bootstrap", () => {
  it("generates a strong temporary password", () => {
    const first = temporaryPassword();
    const second = temporaryPassword();
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(24);
    expect(first).toMatch(/[A-Z]/);
    expect(first).toMatch(/[a-z]/);
    expect(first).toMatch(/[0-9]/);
    expect(first).toMatch(/!/);
  });

  it("requires all institutional identity arguments", () => {
    expect(
      parseArguments([
        "--email",
        "admin@example.gov.co",
        "--name",
        "Ada Admin",
        "--affiliation",
        "CEER",
      ]),
    ).toEqual({
      email: "admin@example.gov.co",
      name: "Ada Admin",
      affiliation: "CEER",
    });
    expect(() => parseArguments(["--email", "admin@example.gov.co"])).toThrow(
      /--name/,
    );
  });

  it("requires a URL and prefers the new server secret", () => {
    expect(
      serverConfiguration({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SECRET_KEY: "new-secret",
        SUPABASE_SERVICE_ROLE_KEY: "legacy-secret",
      }),
    ).toEqual({
      url: "https://example.supabase.co",
      secretKey: "new-secret",
    });
    expect(() => serverConfiguration({})).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL.*SUPABASE_SECRET_KEY/,
    );
  });

  it("refuses to run when a privileged profile already exists", async () => {
    let createCalls = 0;
    const client = {
      from: () => queryResult({
        data: [{ id: "existing", role: "coordinator" }],
        error: null,
      }),
      auth: {
        admin: {
          createUser: async () => {
            createCalls += 1;
          },
        },
      },
    };
    await expect(
      bootstrapSuperAdmin({
        client,
        email: "admin@example.gov.co",
        name: "Ada Admin",
        affiliation: "CEER",
      }),
    ).rejects.toThrow(/ya existe/);
    expect(createCalls).toBe(0);
  });

  it("creates a forced-change super-administrator when none exists", async () => {
    const metadata = [];
    const client = {
      from: () => {
        const query = {
          select: () => query,
          in: () => query,
          limit: async () => ({ data: [], error: null }),
          eq: () => query,
          single: async () => ({
            data: { role: "super_admin", must_change_password: true },
            error: null,
          }),
        };
        return query;
      },
      auth: {
        admin: {
          createUser: async (input) => {
            metadata.push(input.user_metadata);
            return { data: { user: { id: "created" } }, error: null };
          },
          deleteUser: async () => {
            throw new Error("should not roll back");
          },
        },
      },
    };
    const result = await bootstrapSuperAdmin({
      client,
      email: "admin@example.gov.co",
      name: "Ada Admin",
      affiliation: "CEER",
    });
    expect(result.email).toBe("admin@example.gov.co");
    expect(result.password.length).toBeGreaterThanOrEqual(24);
    expect(metadata).toEqual([
      {
        full_name: "Ada Admin",
        affiliation: "CEER",
        role: "super_admin",
        must_change_password: true,
      },
    ]);
  });
});
