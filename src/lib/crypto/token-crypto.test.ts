import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "./token-crypto";

const KEY = randomBytes(32).toString("base64");
const OTHER_KEY = randomBytes(32).toString("base64");

describe("token-crypto", () => {
  it("round-trips, including non-ASCII text", () => {
    for (const secret of ["1//0g-refresh-token_abc", "رمز-سري-🔐", ""]) {
      expect(decryptToken(encryptToken(secret, KEY), KEY)).toBe(secret);
    }
  });

  it("uses a random IV: the same value encrypts differently each time", () => {
    const a = encryptToken("same", KEY);
    const b = encryptToken("same", KEY);
    expect(a).not.toBe(b);
    expect(a.split(".")[1]).not.toBe(b.split(".")[1]);
  });

  it("doesn't contain the plaintext", () => {
    expect(encryptToken("super-secret-token", KEY)).not.toContain("super-secret-token");
  });

  it("rejects a tampered ciphertext, tag or IV", () => {
    const [v, iv, tag, ct] = encryptToken("hello", KEY).split(".");
    const flip = (s: string) => (s[0] === "A" ? "B" : "A") + s.slice(1);
    expect(() => decryptToken([v, iv, tag, flip(ct)].join("."), KEY)).toThrow("Could not decrypt token");
    expect(() => decryptToken([v, iv, flip(tag), ct].join("."), KEY)).toThrow("Could not decrypt token");
    expect(() => decryptToken([v, flip(iv), tag, ct].join("."), KEY)).toThrow("Could not decrypt token");
  });

  it("rejects the wrong key", () => {
    expect(() => decryptToken(encryptToken("hello", KEY), OTHER_KEY)).toThrow("Could not decrypt token");
  });

  it("rejects malformed payloads and bad keys without leaking either", () => {
    expect(() => decryptToken("nonsense", KEY)).toThrow("Unrecognised encrypted token format");
    expect(() => decryptToken("v2.a.b.c", KEY)).toThrow("Unrecognised encrypted token format");
    expect(() => encryptToken("x", Buffer.alloc(16).toString("base64"))).toThrow("32 bytes");
    try {
      encryptToken("x", "short");
    } catch (error) {
      expect(String(error)).not.toContain("short");
    }
  });
});
