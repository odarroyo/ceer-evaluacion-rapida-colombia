import encoding from "k6/encoding";
import http from "k6/http";
import { check } from "k6";

const target = __ENV.CEER_BASE_URL || "http://127.0.0.1:3000";
const sessionCookie = __ENV.CEER_COOKIE || "";
const runId = (__ENV.CEER_RUN_ID || "").toLowerCase();
if (!sessionCookie) throw new Error("CEER_COOKIE is required for authenticated load tests.");
if (!/^[0-9a-f]{8}$/.test(runId)) throw new Error("CEER_RUN_ID must contain exactly eight hexadecimal characters.");
const tinyJpeg = encoding.b64decode("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==", "std");
const authenticated = { headers: { Cookie: sessionCookie }, redirects: 0 };

export const options = {
  scenarios: {
    authenticated_pages: { executor: "shared-iterations", vus: 20, iterations: 200, exec: "pageLoad", maxDuration: "2m", startTime: "0s" },
    concurrent_submissions: { executor: "per-vu-iterations", vus: 100, iterations: 1, exec: "submitInspection", maxDuration: "2m", startTime: "10s" },
    concurrent_photo_uploads: { executor: "per-vu-iterations", vus: 50, iterations: 1, exec: "submitWithPhotos", maxDuration: "3m", startTime: "20s" },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{scenario:authenticated_pages}": ["p(95)<3000"],
  },
};

function submissionPayload(kind) {
  const token = `${__VU}`.padStart(6, "0") + `${__ITER}`.padStart(6, "0");
  const scenarioCode = kind === "photos" ? "8002" : "8001";
  return {
    clientSubmissionId: `${runId}-0000-4000-${scenarioCode}-${token}`,
    formType: "rapid_ceer", schemaVersion: 1, source: "web", inspectionScope: "exterior",
    municipalityCode: "11001", addressReference: `SINTETICO CARGA ${runId} ${kind} ${__VU}-${__ITER}`,
    conditions: { cond_0: "menor", cond_1: "menor", cond_2: "menor", cond_3: "menor", cond_4: "menor", cond_5: "menor" },
    confirmedTag: "habitable", detailedEvaluation: [],
  };
}

export function pageLoad() {
  const response = http.get(`${target}/mis-inspecciones`, authenticated);
  check(response, { "authenticated page responds without redirect": (result) => result.status === 200 });
}

export function submitInspection() {
  const response = http.post(`${target}/api/inspections`, { payload: JSON.stringify(submissionPayload("submissions")), photoMeta: "[]" }, authenticated);
  check(response, {
    "new submission accepted": (result) => result.status === 200 && result.json("retried") !== true && Boolean(result.json("inspectionId")),
  });
}

export function submitWithPhotos() {
  const payload = {
    payload: JSON.stringify(submissionPayload("photos")),
    photoMeta: JSON.stringify(Array.from({ length: 5 }, () => ({ width: 1, height: 1 }))),
    photos: Array.from({ length: 5 }, (_, index) => http.file(tinyJpeg, `photo-${index}.jpg`, "image/jpeg")),
  };
  const response = http.post(`${target}/api/inspections`, payload, authenticated);
  check(response, {
    "five photos persist on a new inspection": (result) => result.status === 200 && result.json("retried") !== true && result.json("photoCount") === 5,
  });
}
