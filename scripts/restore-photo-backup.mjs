import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { decodeBackupKey, decryptBackupBytes, safeStorageSegments } from "./photo-backup-format.mjs";

for (const name of ["PHOTO_BACKUP_KEY", "PHOTO_BACKUP_VERSION_DIRECTORY", "PHOTO_RESTORE_DIRECTORY"]) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}

const key = decodeBackupKey(process.env.PHOTO_BACKUP_KEY);
const versionDirectory = path.resolve(process.env.PHOTO_BACKUP_VERSION_DIRECTORY);
const restoreDirectory = path.resolve(process.env.PHOTO_RESTORE_DIRECTORY);
for (const directory of [versionDirectory, restoreDirectory]) {
  if (directory === path.parse(directory).root) throw new Error("Backup and restore directories cannot be filesystem roots");
}
if (restoreDirectory === versionDirectory || restoreDirectory.startsWith(`${versionDirectory}${path.sep}`)) {
  throw new Error("PHOTO_RESTORE_DIRECTORY must be independent from the encrypted backup version directory");
}

const manifestEnvelope = await fs.readFile(path.join(versionDirectory, "manifest.ceerenc"));
const manifest = JSON.parse(decryptBackupBytes(manifestEnvelope, key).toString("utf8"));
if (manifest.bucket !== "inspection-photos" || !Array.isArray(manifest.objects) || manifest.count !== manifest.objects.length) {
  throw new Error("Invalid photo backup manifest");
}

const requestedSample = process.env.PHOTO_RESTORE_SAMPLE_SIZE
  ? Number.parseInt(process.env.PHOTO_RESTORE_SAMPLE_SIZE, 10)
  : manifest.objects.length;
if (!Number.isInteger(requestedSample) || requestedSample < 1 || requestedSample > manifest.objects.length) {
  throw new Error("PHOTO_RESTORE_SAMPLE_SIZE must be between 1 and the manifest object count");
}

const selected = [...manifest.objects]
  .sort((left, right) => String(left.backupObject).localeCompare(String(right.backupObject)))
  .slice(0, requestedSample);
await fs.mkdir(restoreDirectory, { recursive: false, mode: 0o700 });

let restoredBytes = 0;
for (const item of selected) {
  const segments = safeStorageSegments(item.storagePath);
  const expectedObjectName = `${crypto.createHash("sha256").update(item.storagePath).digest("hex")}.ceerenc`;
  if (item.backupObject !== expectedObjectName || !/^[a-f0-9]{64}\.ceerenc$/.test(item.backupObject)) {
    throw new Error("Backup object name does not match its storage path");
  }
  const encrypted = await fs.readFile(path.join(versionDirectory, item.backupObject));
  const restored = decryptBackupBytes(encrypted, key);
  const newline = restored.indexOf(0x0a);
  if (newline < 2 || newline > 16_384) throw new Error("Invalid encrypted photo envelope metadata");
  const envelope = JSON.parse(restored.subarray(0, newline).toString("utf8"));
  const bytes = restored.subarray(newline + 1);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  if (envelope.storagePath !== item.storagePath || envelope.sha256 !== item.sha256 || envelope.byteSize !== item.byteSize || sha256 !== item.sha256 || bytes.length !== item.byteSize) {
    throw new Error("Restored photo failed its manifest or SHA-256 check");
  }
  const target = path.join(restoreDirectory, ...segments);
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await fs.writeFile(target, bytes, { flag: "wx", mode: 0o600 });
  const writtenHash = crypto.createHash("sha256").update(await fs.readFile(target)).digest("hex");
  if (writtenHash !== item.sha256) throw new Error("Restored photo failed its post-write SHA-256 check");
  restoredBytes += bytes.length;
}

console.log(JSON.stringify({
  status: "verified",
  manifestObjectCount: manifest.count,
  restoredObjectCount: selected.length,
  restoredBytes,
  sha256Verified: true,
}));
