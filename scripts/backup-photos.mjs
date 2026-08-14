import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { decodeBackupKey, encryptBackupBytes } from "./photo-backup-format.mjs";

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "PHOTO_BACKUP_KEY",
  "PHOTO_BACKUP_DIRECTORY",
];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}

const serverSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serverSecret) throw new Error("Missing required environment variable: SUPABASE_SECRET_KEY");

const key = decodeBackupKey(process.env.PHOTO_BACKUP_KEY);
const destinationRoot = path.resolve(process.env.PHOTO_BACKUP_DIRECTORY);
if (destinationRoot === path.parse(destinationRoot).root) throw new Error("PHOTO_BACKUP_DIRECTORY cannot be a filesystem root");
const concurrency = Number.parseInt(process.env.PHOTO_BACKUP_CONCURRENCY || "10", 10);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) {
  throw new Error("PHOTO_BACKUP_CONCURRENCY must be an integer between 1 and 32");
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  serverSecret,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function listAll(prefix = "") {
  const objects = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage.from("inspection-photos").list(prefix, {
      limit: 1_000,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    if (!data?.length) break;
    for (const item of data) {
      const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) objects.push({ path: itemPath, updatedAt: item.updated_at, size: item.metadata?.size ?? null });
      else objects.push(...(await listAll(itemPath)));
    }
    if (data.length < 1_000) break;
    offset += data.length;
  }
  return objects;
}

async function mapConcurrent(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function consume() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(items.length, limit) }, consume));
  return results;
}

const timestamp = new Date().toISOString().replaceAll(":", "-");
const versionDirectory = path.join(destinationRoot, timestamp);
await fs.mkdir(versionDirectory, { recursive: false });
const objects = await listAll();
const manifest = await mapConcurrent(objects, concurrency, async (object) => {
  const { data, error } = await supabase.storage.from("inspection-photos").download(object.path);
  if (error || !data) throw error ?? new Error("Photo download failed");
  const bytes = Buffer.from(await data.arrayBuffer());
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const opaqueName = crypto.createHash("sha256").update(object.path).digest("hex");
  const envelope = Buffer.from(JSON.stringify({ storagePath: object.path, updatedAt: object.updatedAt, sha256, byteSize: bytes.length }) + "\n", "utf8");
  await fs.writeFile(path.join(versionDirectory, `${opaqueName}.ceerenc`), encryptBackupBytes(Buffer.concat([envelope, bytes]), key), { flag: "wx", mode: 0o600 });
  return { storagePath: object.path, updatedAt: object.updatedAt, sha256, byteSize: bytes.length, backupObject: `${opaqueName}.ceerenc` };
});
manifest.sort((left, right) => left.storagePath.localeCompare(right.storagePath));

const manifestBytes = Buffer.from(JSON.stringify({ createdAt: new Date().toISOString(), bucket: "inspection-photos", count: manifest.length, objects: manifest }, null, 2), "utf8");
await fs.writeFile(path.join(versionDirectory, "manifest.ceerenc"), encryptBackupBytes(manifestBytes, key), { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ status: "complete", version: timestamp, objectCount: manifest.length }));
