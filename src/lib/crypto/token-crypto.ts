import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM for tokens at rest (Google refresh tokens). Format:
//   v1.<iv>.<tag>.<ciphertext>   (base64url parts)
// A fresh random 12-byte IV per value; the GCM tag authenticates the
// ciphertext, so a tampered or wrong-key value fails to decrypt instead of
// returning garbage. Errors never include the key or the plaintext.

const VERSION = "v1";

function loadKey(keyBase64?: string): Buffer {
  const raw = keyBase64 ?? process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be 32 bytes, base64 encoded");
  return key;
}

export function encryptToken(plaintext: string, keyBase64?: string): string {
  const key = loadKey(keyBase64);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptToken(payload: string, keyBase64?: string): string {
  const key = loadKey(keyBase64);
  const [version, iv, tag, ciphertext, ...rest] = payload.split(".");
  // An empty ciphertext is legal (an empty plaintext); a missing part is not.
  if (version !== VERSION || !iv || !tag || ciphertext === undefined || rest.length > 0) {
    throw new Error("Unrecognised encrypted token format");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    // Deliberately generic: don't say whether the key or the data was wrong.
    throw new Error("Could not decrypt token");
  }
}
