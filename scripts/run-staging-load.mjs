import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const PAGE_REQUESTS = 200;
const SUBMISSION_REQUESTS = 100;
const PHOTO_REQUESTS = 50;
const PHOTOS_PER_REQUEST = 5;
const P95_LIMIT_MS = 3_000;
const REQUEST_TIMEOUT_MS = 90_000;
const tinyJpeg = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==", "base64");

function requireEnvironment(environment = process.env) {
  const url = environment.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const secretKey = environment.SUPABASE_SECRET_KEY?.trim();
  const baseUrl = (environment.CEER_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
  if (environment.NEXT_PUBLIC_CEER_ENV !== "staging") throw new Error("Load verification is restricted to NEXT_PUBLIC_CEER_ENV=staging.");
  if (!url || !publishableKey || !secretKey) throw new Error("Staging URL, publishable key, and server secret are required.");
  const parsedBaseUrl = new URL(baseUrl);
  if (!['http:', 'https:'].includes(parsedBaseUrl.protocol)) throw new Error("CEER_BASE_URL must be HTTP(S).");
  return { url, publishableKey, secretKey, baseUrl };
}

async function sessionCookieForProfile(admin, url, publishableKey, profileId) {
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(profileId);
  const email = userData.user?.email;
  if (userError || !email) throw userError ?? new Error("Synthetic load profile has no email.");
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = linkData.properties?.hashed_token;
  if (linkError || !tokenHash) throw linkError ?? new Error("Could not create a one-use staging load session.");

  const client = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: verified, error: verifyError } = await client.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (verifyError || !verified.session) throw verifyError ?? new Error("Could not verify the one-use staging load session.");

  let cookieJar = [];
  const serverClient = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => cookieJar,
      setAll: (cookies) => { cookieJar = cookies; },
    },
  });
  const { error: sessionError } = await serverClient.auth.setSession({
    access_token: verified.session.access_token,
    refresh_token: verified.session.refresh_token,
  });
  if (sessionError) throw sessionError;
  return cookieJar.map(({ name, value }) => `${name}=${value}`).join("; ");
}

function p95(durations) {
  if (!durations.length) return null;
  const ordered = [...durations].sort((left, right) => left - right);
  return Math.round(ordered[Math.max(0, Math.ceil(ordered.length * 0.95) - 1)]);
}

async function runPool(count, concurrency, worker) {
  const results = new Array(count);
  let cursor = 0;
  async function consume() {
    while (cursor < count) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(count, concurrency) }, consume));
  return results;
}

async function timedFetch(url, init) {
  const started = performance.now();
  try {
    const response = await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    return { response, durationMs: performance.now() - started };
  } catch (error) {
    return { error, durationMs: performance.now() - started };
  }
}

async function responseJson(response) {
  try { return await response.json(); }
  catch { return null; }
}

function payload({ clientSubmissionId, addressReference }) {
  return {
    clientSubmissionId,
    formType: "rapid_ceer",
    schemaVersion: 1,
    source: "web",
    inspectionScope: "exterior",
    municipalityCode: "11001",
    buildingName: "Edificación sintética de carga",
    addressReference,
    conditions: {
      cond_0: "menor", cond_1: "menor", cond_2: "menor",
      cond_3: "menor", cond_4: "menor", cond_5: "menor",
    },
    confirmedTag: "habitable",
    detailedEvaluation: [],
  };
}

function inspectionBody(input, photoCount = 0) {
  const form = new FormData();
  form.set("payload", JSON.stringify(input));
  form.set("photoMeta", JSON.stringify(Array.from({ length: photoCount }, () => ({ width: 1, height: 1 }))));
  for (let index = 0; index < photoCount; index += 1) {
    form.append("photos", new Blob([tinyJpeg], { type: "image/jpeg" }), `synthetic-${index + 1}.jpg`);
  }
  return form;
}

function summarize(results) {
  const successful = results.filter((item) => item.ok).length;
  const durations = results.map((item) => item.durationMs);
  return {
    requested: results.length,
    successful,
    failed: results.length - successful,
    failureRate: Number(((results.length - successful) / results.length).toFixed(4)),
    p95Ms: p95(durations),
  };
}

function equalSets(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

async function main() {
  const { url, publishableKey, secretKey, baseUrl } = requireEnvironment();
  const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const [{ data: profiles, error: profileError }, healthResult] = await Promise.all([
    admin.from("profiles").select("id,role,active,must_change_password").eq("active", true).eq("must_change_password", false),
    timedFetch(`${baseUrl}/api/health`, {}),
  ]);
  if (profileError) throw profileError;
  if (!healthResult.response?.ok) throw new Error("Staging health endpoint is unavailable.");
  const health = await responseJson(healthResult.response);
  if (health?.status !== "ok" || health?.mode !== "staging" || health?.backend !== "supabase") {
    throw new Error("CEER_BASE_URL is not a healthy Supabase-backed staging deployment.");
  }

  const inspector = profiles?.find((profile) => profile.role === "inspector");
  const coordinator = profiles?.find((profile) => profile.role === "coordinator" || profile.role === "super_admin");
  if (!inspector || !coordinator) throw new Error("An active inspector and coordinator with completed password changes are required.");
  const [inspectorCookie, coordinatorCookie] = await Promise.all([
    sessionCookieForProfile(admin, url, publishableKey, inspector.id),
    sessionCookieForProfile(admin, url, publishableKey, coordinator.id),
  ]);
  const inspectorHeaders = { Cookie: inspectorCookie };
  const coordinatorHeaders = { Cookie: coordinatorCookie };
  const runId = crypto.randomBytes(4).toString("hex");
  const prefix = `SINTETICO ACEPTACION ${runId}`;

  const boundaryResponses = await Promise.all([
    timedFetch(`${baseUrl}/coordinacion`, { headers: inspectorHeaders }),
    timedFetch(`${baseUrl}/api/exports/inspections`, { headers: inspectorHeaders }),
    timedFetch(`${baseUrl}/coordinacion`, { headers: coordinatorHeaders }),
  ]);
  await Promise.all(boundaryResponses.map(({ response }) => response?.arrayBuffer()));
  const roleBoundaries = {
    inspectorCoordinationRedirected: [302, 303, 307, 308].includes(boundaryResponses[0].response?.status),
    inspectorExportDenied: boundaryResponses[1].response?.status === 403,
    coordinatorPageAllowed: boundaryResponses[2].response?.status === 200,
  };

  const recoveryId = crypto.randomUUID();
  const recoveryPayload = payload({ clientSubmissionId: recoveryId, addressReference: `${prefix} RECUPERACION` });
  const firstRecovery = await timedFetch(`${baseUrl}/api/inspections`, {
    method: "POST", headers: inspectorHeaders, body: inspectionBody(recoveryPayload),
  });
  const firstRecoveryJson = firstRecovery.response ? await responseJson(firstRecovery.response) : null;
  const secondRecovery = await timedFetch(`${baseUrl}/api/inspections`, {
    method: "POST", headers: inspectorHeaders, body: inspectionBody(recoveryPayload),
  });
  const secondRecoveryJson = secondRecovery.response ? await responseJson(secondRecovery.response) : null;
  const { data: recoveryRows, error: recoveryError } = await admin
    .from("inspections")
    .select("id,receipt_code")
    .eq("inspector_id", inspector.id)
    .eq("client_submission_id", recoveryId);
  if (recoveryError) throw recoveryError;
  const recovery = {
    firstAccepted: firstRecovery.response?.status === 200,
    retryAccepted: secondRecovery.response?.status === 200,
    retryFlag: secondRecoveryJson?.retried === true,
    sameReceipt: Boolean(firstRecoveryJson?.receiptCode) && firstRecoveryJson?.receiptCode === secondRecoveryJson?.receiptCode,
    databaseRows: recoveryRows?.length ?? 0,
  };

  await timedFetch(`${baseUrl}/mis-inspecciones`, { headers: inspectorHeaders }).then(({ response }) => response?.arrayBuffer());
  const pageResults = await runPool(PAGE_REQUESTS, 20, async () => {
    const result = await timedFetch(`${baseUrl}/mis-inspecciones`, { headers: inspectorHeaders });
    if (result.response) await result.response.arrayBuffer();
    return { ok: result.response?.status === 200, durationMs: result.durationMs };
  });

  const submissionResults = await runPool(SUBMISSION_REQUESTS, SUBMISSION_REQUESTS, async (index) => {
    const result = await timedFetch(`${baseUrl}/api/inspections`, {
      method: "POST",
      headers: inspectorHeaders,
      body: inspectionBody(payload({ clientSubmissionId: crypto.randomUUID(), addressReference: `${prefix} ENVIO ${index + 1}` })),
    });
    const data = result.response ? await responseJson(result.response) : null;
    return {
      ok: result.response?.status === 200 && data?.retried !== true && Boolean(data?.inspectionId) && Boolean(data?.receiptCode),
      durationMs: result.durationMs,
      inspectionId: data?.inspectionId,
      receiptCode: data?.receiptCode,
    };
  });

  const photoResults = await runPool(PHOTO_REQUESTS, PHOTO_REQUESTS, async (index) => {
    const result = await timedFetch(`${baseUrl}/api/inspections`, {
      method: "POST",
      headers: inspectorHeaders,
      body: inspectionBody(payload({ clientSubmissionId: crypto.randomUUID(), addressReference: `${prefix} FOTOS ${index + 1}` }), PHOTOS_PER_REQUEST),
    });
    const data = result.response ? await responseJson(result.response) : null;
    return {
      ok: result.response?.status === 200 && data?.retried !== true && data?.photoCount === PHOTOS_PER_REQUEST && Boolean(data?.inspectionId),
      durationMs: result.durationMs,
      inspectionId: data?.inspectionId,
      receiptCode: data?.receiptCode,
    };
  });

  const { data: loadRows, error: loadRowsError } = await admin
    .from("inspections")
    .select("id,receipt_code,address_reference")
    .eq("inspector_id", inspector.id)
    .like("address_reference", `${prefix} %`);
  if (loadRowsError) throw loadRowsError;
  const submissionDbRows = (loadRows ?? []).filter((row) => row.address_reference.startsWith(`${prefix} ENVIO `));
  const photoDbRows = (loadRows ?? []).filter((row) => row.address_reference.startsWith(`${prefix} FOTOS `));
  const photoIds = photoDbRows.map((row) => row.id);
  const { data: photoRows, error: photoRowsError } = photoIds.length
    ? await admin.from("inspection_photos").select("inspection_id,storage_path").in("inspection_id", photoIds)
    : { data: [], error: null };
  if (photoRowsError) throw photoRowsError;

  const storageListings = await runPool(photoIds.length, 10, async (index) => {
    const inspectionId = photoIds[index];
    const { data, error } = await admin.storage.from("inspection-photos").list(inspectionId, { limit: 10 });
    if (error) return { inspectionId, paths: [], error: true };
    return { inspectionId, paths: (data ?? []).filter((item) => item.id).map((item) => `${inspectionId}/${item.name}`), error: false };
  });
  const responseSubmissionIds = new Set(submissionResults.filter((item) => item.ok).map((item) => item.inspectionId));
  const responsePhotoIds = new Set(photoResults.filter((item) => item.ok).map((item) => item.inspectionId));
  const responseReceipts = new Set([...submissionResults, ...photoResults].filter((item) => item.ok).map((item) => item.receiptCode));
  const databaseSubmissionIds = new Set(submissionDbRows.map((row) => row.id));
  const databasePhotoIds = new Set(photoDbRows.map((row) => row.id));
  const databasePhotoPaths = new Set((photoRows ?? []).map((row) => row.storage_path));
  const storagePhotoPaths = new Set(storageListings.flatMap((item) => item.paths));
  const photoCounts = new Map();
  for (const row of photoRows ?? []) photoCounts.set(row.inspection_id, (photoCounts.get(row.inspection_id) ?? 0) + 1);

  const pages = summarize(pageResults);
  const submissions = summarize(submissionResults);
  const photos = summarize(photoResults);
  const persistence = {
    submissionRows: submissionDbRows.length,
    photoInspectionRows: photoDbRows.length,
    photoMetadataRows: photoRows?.length ?? 0,
    storageObjects: storagePhotoPaths.size,
    uniqueResponseReceipts: responseReceipts.size,
    submissionResponseDatabaseMatch: equalSets(responseSubmissionIds, databaseSubmissionIds),
    photoResponseDatabaseMatch: equalSets(responsePhotoIds, databasePhotoIds),
    fivePhotosPerInspection: photoIds.length === PHOTO_REQUESTS && photoIds.every((id) => photoCounts.get(id) === PHOTOS_PER_REQUEST),
    storageMetadataMatch: storageListings.every((item) => !item.error) && equalSets(databasePhotoPaths, storagePhotoPaths),
  };
  const thresholds = {
    pageP95Under3s: pages.p95Ms !== null && pages.p95Ms < P95_LIMIT_MS,
    failureRatesUnder1Percent: [pages, submissions, photos].every((summary) => summary.failureRate < 0.01),
  };
  const persistencePassed =
    persistence.submissionRows === SUBMISSION_REQUESTS
    && persistence.photoInspectionRows === PHOTO_REQUESTS
    && persistence.photoMetadataRows === PHOTO_REQUESTS * PHOTOS_PER_REQUEST
    && persistence.storageObjects === PHOTO_REQUESTS * PHOTOS_PER_REQUEST
    && persistence.uniqueResponseReceipts === SUBMISSION_REQUESTS + PHOTO_REQUESTS
    && persistence.submissionResponseDatabaseMatch
    && persistence.photoResponseDatabaseMatch
    && persistence.fivePhotosPerInspection
    && persistence.storageMetadataMatch;
  const passed = [
    ...Object.values(roleBoundaries),
    recovery.firstAccepted, recovery.retryAccepted, recovery.retryFlag, recovery.sameReceipt, recovery.databaseRows === 1,
    persistencePassed,
    ...Object.values(thresholds),
  ].every(Boolean);

  const evidence = {
    status: passed ? "pass" : "fail",
    recordedAt: new Date().toISOString(),
    runId,
    target: new URL(baseUrl).origin,
    health: { status: health.status, mode: health.mode, backend: health.backend, municipalityCount: health.checks?.municipalityCount },
    roleBoundaries,
    recovery,
    authenticatedPages: pages,
    concurrentSubmissions: submissions,
    concurrentFivePhotoUploads: photos,
    persistence: { ...persistence, passed: persistencePassed },
    observedLatency: { submissionP95Ms: submissions.p95Ms, fivePhotoUploadP95Ms: photos.p95Ms },
    thresholds,
  };
  const evidenceDirectory = path.resolve("docs/evidence");
  await fs.mkdir(evidenceDirectory, { recursive: true });
  await fs.writeFile(
    path.join(evidenceDirectory, `staging-load-${runId}.json`),
    `${JSON.stringify(evidence, null, 2)}\n`,
    { flag: "wx", mode: 0o600 },
  );
  console.log(JSON.stringify(evidence, null, 2));
  if (!passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Staging load verification failed.");
  process.exitCode = 1;
});
