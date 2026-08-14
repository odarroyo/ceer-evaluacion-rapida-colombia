export type BrandingValues = {
  NEXT_PUBLIC_OPERATOR_NAME?: string;
  NEXT_PUBLIC_OPERATOR_SHORT_NAME?: string;
  NEXT_PUBLIC_OPERATOR_LOGO_PATH?: string;
};

export type OperatorBranding = {
  operatorName: string;
  operatorShortName: string;
  operatorLogoPath: string;
};

const DEFAULT_BRANDING: OperatorBranding = {
  operatorName: "Institución usuaria",
  operatorShortName: "Institución",
  operatorLogoPath: "/operator-placeholder.svg",
};

function currentBranding(): BrandingValues {
  // Explicit accesses are required for NEXT_PUBLIC_ build-time inlining.
  return {
    NEXT_PUBLIC_OPERATOR_NAME: process.env.NEXT_PUBLIC_OPERATOR_NAME,
    NEXT_PUBLIC_OPERATOR_SHORT_NAME:
      process.env.NEXT_PUBLIC_OPERATOR_SHORT_NAME,
    NEXT_PUBLIC_OPERATOR_LOGO_PATH:
      process.env.NEXT_PUBLIC_OPERATOR_LOGO_PATH,
  };
}

function cleanLabel(value: string | undefined, fallback: string, max: number) {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized && normalized.length <= max ? normalized : fallback;
}

function cleanLogoPath(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized || !normalized.startsWith("/") || normalized.startsWith("//")) {
    return DEFAULT_BRANDING.operatorLogoPath;
  }
  return normalized;
}

export function getOperatorBranding(
  values: BrandingValues = currentBranding(),
): OperatorBranding {
  return {
    operatorName: cleanLabel(
      values.NEXT_PUBLIC_OPERATOR_NAME,
      DEFAULT_BRANDING.operatorName,
      120,
    ),
    operatorShortName: cleanLabel(
      values.NEXT_PUBLIC_OPERATOR_SHORT_NAME,
      DEFAULT_BRANDING.operatorShortName,
      40,
    ),
    operatorLogoPath: cleanLogoPath(values.NEXT_PUBLIC_OPERATOR_LOGO_PATH),
  };
}
