import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { decodeBackupKey, decryptBackupBytes, encryptBackupBytes, safeStorageSegments } from "./photo-backup-format.mjs";

describe("encrypted photo backup format", () => {
  it("round-trips authenticated bytes with a 32-byte key", () => {
    const key = crypto.randomBytes(32);
    const plain = Buffer.from("synthetic photo bytes", "utf8");
    expect(decryptBackupBytes(encryptBackupBytes(plain, key), key)).toEqual(plain);
  });

  it("rejects tampering and the wrong key", () => {
    const key = crypto.randomBytes(32);
    const envelope = encryptBackupBytes(Buffer.from("synthetic"), key);
    envelope[envelope.length - 1] ^= 1;
    expect(() => decryptBackupBytes(envelope, key)).toThrow();
    expect(() => decryptBackupBytes(encryptBackupBytes(Buffer.from("synthetic"), key), crypto.randomBytes(32))).toThrow();
  });

  it("validates key size and restore paths", () => {
    expect(decodeBackupKey(crypto.randomBytes(32).toString("base64"))).toHaveLength(32);
    expect(() => decodeBackupKey(Buffer.alloc(31).toString("base64"))).toThrow(/32 random bytes/);
    expect(safeStorageSegments("inspection-id/photo.jpg")).toEqual(["inspection-id", "photo.jpg"]);
    for (const unsafe of ["", "/absolute/photo.jpg", "../photo.jpg", "inspection/../photo.jpg", "inspection\\photo.jpg"]) {
      expect(() => safeStorageSegments(unsafe)).toThrow(/Invalid storage path/);
    }
  });
});
