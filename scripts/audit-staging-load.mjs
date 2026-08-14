import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { percentile95, requireStagingEnvironment, runPool, sessionCookieForProfile, timedFetch } from "./staging-test-session.mjs";

const PAGE_REQUESTS = 200;
const EXPECTED_SUBMISSIONS = 100;
const EXPECTED_PHOTO_INSPECTIONS = 50;
const PHOTOS_PER_INSPECTION = 5;
const runId = process.env.CEER_LOAD_RUN_ID?.trim().toLowerCase();
if (!runId || !/^[0-9a-f]{8}$/.test(runId)) throw new Error("CEER_LOAD_RUN_ID must contain the eight-hex run identifier to audit.");

function inspectionPayload(row) {
  return {
    clientSubmissionId: row.client_submission_id,
    formType: "rapid_ceer",
    schemaVersion: 1,
    source: "web",
    inspectionScope: "exterior",
    municipalityCode: "11001",
    buildingName: "Edificación sintética de carga",
    addressReference: row.address_reference,
    conditions: { cond_0: "menor", cond_1: "menor", cond_2: "menor", cond_3: "menor", cond_4: "menor", cond_5: "menor" },
    confirmedTag: "habitable",
    detailedEvaluation: [],
  };
}

function emptyInspectionBody(input) {
  const body = new FormData();
  body.set("payload", JSON.stringify(input));
  body.set("photoMeta", "[]");
  return body;
}

const { url, publishableKey, secretKey, baseUrl } = requireStagingEnvironment();
const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const prefix = `SINTETICO ACEPTACION ${runId}`;
const { data: rows, error: rowError } = await admin
  .from("inspections")
  .select("id,receipt_code,client_submission_id,inspector_id,address_reference")
  .like("address_reference", `${prefix} %`)
  .limit(1_000);
if (rowError) throw rowError;
const ownerIds = new Set((rows ?? []).map((row) => row.inspector_id));
if (ownerIds.size !== 1) throw new Error("The audited run is missing or spans more than one inspector.");
const ownerId = [...ownerIds][0];
const recoveryRow = rows?.find((row) => row.address_reference === `${prefix} RECUPERACION`);
if (!recoveryRow) throw new Error("The audited run has no recovery record.");

const { data: coordinator, error: coordinatorError } = await admin
  .from("profiles")
  .select("id")
  .in("role", ["coordinator", "super_admin"])
  .eq("active", true)
  .eq("must_change_password", false)
  .limit(1)
  .single();
if (coordinatorError || !coordinator) throw coordinatorError ?? new Error("No active coordinator is available.");
const [ownerCookie, coordinatorCookie] = await Promise.all([
  sessionCookieForProfile(admin, url, publishableKey, ownerId),
  sessionCookieForProfile(admin, url, publishableKey, coordinator.id),
]);
const ownerHeaders = { Cookie: ownerCookie };
const coordinatorHeaders = { Cookie: coordinatorCookie };

const roleResponses = await Promise.all([
  timedFetch(`${baseUrl}/coordinacion`, { headers: ownerHeaders }),
  timedFetch(`${baseUrl}/api/exports/inspections`, { headers: ownerHeaders }),
  timedFetch(`${baseUrl}/coordinacion`, { headers: coordinatorHeaders }),
]);
await Promise.all(roleResponses.map(({ response }) => response?.arrayBuffer()));
const roleBoundaries = {
  inspectorCoordinationRedirected: [302, 303, 307, 308].includes(roleResponses[0].response?.status),
  inspectorExportDenied: roleResponses[1].response?.status === 403,
  coordinatorPageAllowed: roleResponses[2].response?.status === 200,
};

const retryResult = await timedFetch(`${baseUrl}/api/inspections`, {
  method: "POST",
  headers: ownerHeaders,
  body: emptyInspectionBody(inspectionPayload(recoveryRow)),
});
let retryJson = null;
try { retryJson = await retryResult.response?.json(); } catch { /* Response shape is asserted below. */ }
const { data: recoveryRows, error: recoveryError } = await admin
  .from("inspections")
  .select("id,receipt_code")
  .eq("inspector_id", ownerId)
  .eq("client_submission_id", recoveryRow.client_submission_id);
if (recoveryError) throw recoveryError;
const recovery = {
  retryAccepted: retryResult.response?.status === 200,
  retryFlag: retryJson?.retried === true,
  sameReceipt: retryJson?.receiptCode === recoveryRow.receipt_code,
  databaseRows: recoveryRows?.length ?? 0,
};

const pageResults = await runPool(PAGE_REQUESTS, 20, async () => {
  const result = await timedFetch(`${baseUrl}/mis-inspecciones`, { headers: ownerHeaders });
  if (result.response) await result.response.arrayBuffer();
  return { ok: result.response?.status === 200, durationMs: result.durationMs };
});
const pageDurations = pageResults.map((item) => item.durationMs);
const authenticatedPages = {
  requested: PAGE_REQUESTS,
  successful: pageResults.filter((item) => item.ok).length,
  failed: pageResults.filter((item) => !item.ok).length,
  p95Ms: percentile95(pageDurations),
};

const submissionRows = (rows ?? []).filter((row) => row.address_reference.startsWith(`${prefix} ENVIO `));
const photoInspectionRows = (rows ?? []).filter((row) => row.address_reference.startsWith(`${prefix} FOTOS `));
const photoInspectionIds = photoInspectionRows.map((row) => row.id);
const { data: photoRows, error: photoError } = await admin
  .from("inspection_photos")
  .select("inspection_id,storage_path")
  .in("inspection_id", photoInspectionIds);
if (photoError) throw photoError;
const storageListings = await runPool(photoInspectionIds.length, 10, async (index) => {
  const inspectionId = photoInspectionIds[index];
  const { data, error } = await admin.storage.from("inspection-photos").list(inspectionId, { limit: 10 });
  return { error: Boolean(error), paths: (data ?? []).filter((item) => item.id).map((item) => `${inspectionId}/${item.name}`) };
});
const metadataPaths = new Set((photoRows ?? []).map((row) => row.storage_path));
const storagePaths = new Set(storageListings.flatMap((item) => item.paths));
const perInspectionCounts = new Map();
for (const row of photoRows ?? []) perInspectionCounts.set(row.inspection_id, (perInspectionCounts.get(row.inspection_id) ?? 0) + 1);
const uniqueReceipts = new Set([...submissionRows, ...photoInspectionRows].map((row) => row.receipt_code));
const persistence = {
  submissionRows: submissionRows.length,
  photoInspectionRows: photoInspectionRows.length,
  uniqueReceipts: uniqueReceipts.size,
  photoMetadataRows: photoRows?.length ?? 0,
  storageObjects: storagePaths.size,
  fivePhotosPerInspection: photoInspectionIds.every((id) => perInspectionCounts.get(id) === PHOTOS_PER_INSPECTION),
  noOrphanedOrMissingStorageObjects: !storageListings.some((item) => item.error)
    && metadataPaths.size === storagePaths.size
    && [...metadataPaths].every((item) => storagePaths.has(item)),
};
const passed = Object.values(roleBoundaries).every(Boolean)
  && recovery.retryAccepted && recovery.retryFlag && recovery.sameReceipt && recovery.databaseRows === 1
  && authenticatedPages.successful === PAGE_REQUESTS && authenticatedPages.failed === 0 && authenticatedPages.p95Ms < 3_000
  && persistence.submissionRows === EXPECTED_SUBMISSIONS
  && persistence.photoInspectionRows === EXPECTED_PHOTO_INSPECTIONS
  && persistence.uniqueReceipts === EXPECTED_SUBMISSIONS + EXPECTED_PHOTO_INSPECTIONS
  && persistence.photoMetadataRows === EXPECTED_PHOTO_INSPECTIONS * PHOTOS_PER_INSPECTION
  && persistence.storageObjects === EXPECTED_PHOTO_INSPECTIONS * PHOTOS_PER_INSPECTION
  && persistence.fivePhotosPerInspection
  && persistence.noOrphanedOrMissingStorageObjects;
const evidence = {
  status: passed ? "pass" : "fail",
  recordedAt: new Date().toISOString(),
  runId,
  target: new URL(baseUrl).origin,
  roleBoundaries,
  recovery,
  authenticatedPages,
  concurrentSubmissions: { expected: EXPECTED_SUBMISSIONS, persisted: persistence.submissionRows },
  uniqueReceiptsAcrossAllConcurrentWrites: persistence.uniqueReceipts,
  concurrentFivePhotoUploads: {
    expectedInspections: EXPECTED_PHOTO_INSPECTIONS,
    persistedInspections: persistence.photoInspectionRows,
    expectedPhotos: EXPECTED_PHOTO_INSPECTIONS * PHOTOS_PER_INSPECTION,
    persistedPhotoMetadata: persistence.photoMetadataRows,
    storageObjects: persistence.storageObjects,
    fivePhotosPerInspection: persistence.fivePhotosPerInspection,
    noOrphanedOrMissingStorageObjects: persistence.noOrphanedOrMissingStorageObjects,
  },
};
const evidenceDirectory = path.resolve("docs/evidence");
await fs.mkdir(evidenceDirectory, { recursive: true });
await fs.writeFile(path.join(evidenceDirectory, `staging-load-${runId}.json`), `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx", mode: 0o600 });
console.log(JSON.stringify(evidence, null, 2));
if (!passed) process.exitCode = 1;
