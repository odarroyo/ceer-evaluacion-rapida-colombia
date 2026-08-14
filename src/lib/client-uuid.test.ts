import { describe, expect, it, vi } from "vitest";
import { createClientUuid } from "@/lib/client-uuid";

describe("client UUID generation", () => {
  it("uses randomUUID when the secure-context API is available", () => {
    const randomUUID = vi.fn(() => "305e71b4-59ab-4a1d-a8d0-26b3747d9e5b");
    expect(createClientUuid({ randomUUID, getRandomValues: vi.fn() })).toBe("305e71b4-59ab-4a1d-a8d0-26b3747d9e5b");
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it("creates an RFC 4122 version-4 UUID when randomUUID is unavailable on LAN HTTP", () => {
    const getRandomValues = (bytes: Uint8Array) => {
      bytes.set([0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0xc8, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]);
      return bytes;
    };
    const value = createClientUuid({ getRandomValues });
    expect(value).toBe("00112233-4455-4677-8899-aabbccddeeff");
    expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("fails explicitly if the browser has no secure random source", () => {
    expect(() => createClientUuid({ getRandomValues: undefined as never })).toThrow(/generación aleatoria segura/);
  });
});
