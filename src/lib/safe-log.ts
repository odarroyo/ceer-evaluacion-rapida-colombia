const SENSITIVE_KEYS = new Set([
  "addressReference",
  "buildingContact",
  "coordinates",
  "conditions",
  "questionnaireSnapshot",
  "photos",
  "latitude",
  "longitude",
]);

export function redactForLog(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactForLog);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        SENSITIVE_KEYS.has(key) ? "[REDACTED]" : redactForLog(nested),
      ]),
    );
  }
  return value;
}

export function operationalLog(
  event: string,
  metadata: Record<string, unknown> = {},
) {
  const safeMetadata = redactForLog(metadata) as Record<string, unknown>;
  console.info(JSON.stringify({ event, ...safeMetadata }));
}
