import crypto from "node:crypto";
import path from "node:path";

export const BACKUP_MAGIC = Buffer.from("CEERBACKUP1", "ascii");
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export function decodeBackupKey(encoded) {
  const key = Buffer.from(encoded ?? "", "base64");
  if (key.length !== 32) throw new Error("PHOTO_BACKUP_KEY must be exactly 32 random bytes encoded as base64");
  return key;
}

export function encryptBackupBytes(plain, key) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([BACKUP_MAGIC, iv, cipher.getAuthTag(), encrypted]);
}

export function decryptBackupBytes(envelope, key) {
  const minimumLength = BACKUP_MAGIC.length + IV_BYTES + AUTH_TAG_BYTES;
  if (envelope.length < minimumLength || !envelope.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)) {
    throw new Error("Invalid CEER backup envelope");
  }
  const ivStart = BACKUP_MAGIC.length;
  const tagStart = ivStart + IV_BYTES;
  const bodyStart = tagStart + AUTH_TAG_BYTES;
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, envelope.subarray(ivStart, tagStart));
  decipher.setAuthTag(envelope.subarray(tagStart, bodyStart));
  return Buffer.concat([decipher.update(envelope.subarray(bodyStart)), decipher.final()]);
}

export function safeStorageSegments(storagePath) {
  if (typeof storagePath !== "string" || !storagePath || path.isAbsolute(storagePath) || storagePath.includes("\\")) {
    throw new Error("Invalid storage path in backup manifest");
  }
  const segments = storagePath.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("Invalid storage path in backup manifest");
  }
  return segments;
}
