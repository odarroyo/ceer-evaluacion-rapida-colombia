import { describe, expect, it } from "vitest";
import { getOperatorBranding } from "@/lib/branding";

describe("operator branding", () => {
  it("uses a neutral public default", () => {
    expect(getOperatorBranding({})).toEqual({
      operatorName: "Institución usuaria",
      operatorShortName: "Institución",
      operatorLogoPath: "/operator-placeholder.svg",
    });
  });

  it("normalizes configured labels and accepts a public asset path", () => {
    expect(
      getOperatorBranding({
        NEXT_PUBLIC_OPERATOR_NAME: "  Entidad   de respuesta  ",
        NEXT_PUBLIC_OPERATOR_SHORT_NAME: " ER ",
        NEXT_PUBLIC_OPERATOR_LOGO_PATH: " /branding/operador.svg ",
      }),
    ).toEqual({
      operatorName: "Entidad de respuesta",
      operatorShortName: "ER",
      operatorLogoPath: "/branding/operador.svg",
    });
  });

  it("rejects external, protocol-relative, and overlong public values", () => {
    expect(
      getOperatorBranding({
        NEXT_PUBLIC_OPERATOR_NAME: "x".repeat(121),
        NEXT_PUBLIC_OPERATOR_SHORT_NAME: "x".repeat(41),
        NEXT_PUBLIC_OPERATOR_LOGO_PATH: "https://example.com/mark.svg",
      }),
    ).toEqual({
      operatorName: "Institución usuaria",
      operatorShortName: "Institución",
      operatorLogoPath: "/operator-placeholder.svg",
    });
    expect(
      getOperatorBranding({ NEXT_PUBLIC_OPERATOR_LOGO_PATH: "//example.com/a.svg" })
        .operatorLogoPath,
    ).toBe("/operator-placeholder.svg");
  });
});
