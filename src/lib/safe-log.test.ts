import { describe, expect, it, vi } from "vitest";
import { operationalLog, redactForLog } from "@/lib/safe-log";

describe("safe operational logging", () => {
  it("redacts exact coordinates, contacts, payloads, conditions, and photos recursively", () => {
    expect(redactForLog({
      inspectionId: "safe-id",
      addressReference: "sensitive address",
      nested: { coordinates: { latitude: 4.1, longitude: -74.1 }, buildingContact: "3000000000" },
      photos: ["content"],
      questionnaireSnapshot: { cond_0: "severo" },
    })).toEqual({
      inspectionId: "safe-id",
      addressReference: "[REDACTED]",
      nested: { coordinates: "[REDACTED]", buildingContact: "[REDACTED]" },
      photos: "[REDACTED]",
      questionnaireSnapshot: "[REDACTED]",
    });
  });

  it("writes only redacted metadata", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    operationalLog("inspection.test", { latitude: 4.1, receiptCode: "CEER-test" });
    expect(info).toHaveBeenCalledWith(expect.stringContaining('"latitude":"[REDACTED]"'));
    expect(info).toHaveBeenCalledWith(expect.stringContaining('"receiptCode":"CEER-test"'));
    info.mockRestore();
  });
});
