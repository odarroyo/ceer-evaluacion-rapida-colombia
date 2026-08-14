import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

if (process.env.NEXT_PUBLIC_CEER_ENV !== "staging") {
  throw new Error("Photo backup acceptance is restricted to NEXT_PUBLIC_CEER_ENV=staging.");
}

function runNode(script, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: process.cwd(),
      env: { ...process.env, ...environment },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr.trim() || `${script} exited with code ${code}`));
      resolve(stdout.trim());
    });
  });
}

const runId = crypto.randomBytes(4).toString("hex");
const key = crypto.randomBytes(32).toString("base64");
const encryptedRoot = path.resolve("outputs/staging-photo-backup-acceptance", runId);
const restoreRoot = path.join("/private/tmp", `ceer-photo-restore-${runId}`);
await fs.mkdir(path.dirname(encryptedRoot), { recursive: true, mode: 0o700 });
await fs.mkdir(encryptedRoot, { recursive: false, mode: 0o700 });

const backupOutput = JSON.parse(await runNode("scripts/backup-photos.mjs", {
  PHOTO_BACKUP_KEY: key,
  PHOTO_BACKUP_DIRECTORY: encryptedRoot,
}));
const versionDirectory = path.join(encryptedRoot, backupOutput.version);
const restoreOutput = JSON.parse(await runNode("scripts/restore-photo-backup.mjs", {
  PHOTO_BACKUP_KEY: key,
  PHOTO_BACKUP_VERSION_DIRECTORY: versionDirectory,
  PHOTO_RESTORE_DIRECTORY: restoreRoot,
}));

const manifestStat = await fs.stat(path.join(versionDirectory, "manifest.ceerenc"));
const encryptedEntries = await fs.readdir(versionDirectory);
const checks = {
  backupCompleted: backupOutput.status === "complete" && backupOutput.objectCount > 0,
  encryptedManifestPresent: manifestStat.isFile() && manifestStat.size > 0,
  oneEncryptedObjectPerPhoto: encryptedEntries.filter((name) => name.endsWith(".ceerenc") && name !== "manifest.ceerenc").length === backupOutput.objectCount,
  fullRestoreCountMatches: restoreOutput.status === "verified" && restoreOutput.restoredObjectCount === backupOutput.objectCount,
  sha256VerifiedAfterWrite: restoreOutput.sha256Verified === true,
};
const evidence = {
  status: Object.values(checks).every(Boolean) ? "pass" : "fail",
  recordedAt: new Date().toISOString(),
  runId,
  source: "Supabase staging private bucket",
  encryptedCopy: "independent encrypted staging acceptance directory",
  restoreTarget: "isolated local temporary directory",
  encryption: "AES-256-GCM with a unique 96-bit IV per object and encrypted manifest",
  keyHandling: "ephemeral acceptance key; not retained or printed",
  backupObjectCount: backupOutput.objectCount,
  restoredObjectCount: restoreOutput.restoredObjectCount,
  restoredBytes: restoreOutput.restoredBytes,
  checks,
  operationalNote: "Production requires a separately retained key in the approved secrets manager and independent durable/versioned worker storage.",
};
const evidenceDirectory = path.resolve("docs/evidence");
await fs.mkdir(evidenceDirectory, { recursive: true });
await fs.writeFile(path.join(evidenceDirectory, `staging-photo-backup-${runId}.json`), `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx", mode: 0o600 });
console.log(JSON.stringify(evidence, null, 2));
if (evidence.status !== "pass") process.exitCode = 1;
