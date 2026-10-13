import { describe, expect, it } from "vitest";
import { normalizeVoiceMime, sniffVoiceMime } from "./voice-notes";

describe("normalizeVoiceMime", () => {
  it("strips codec parameters and accepts only the two recorder formats", () => {
    expect(normalizeVoiceMime("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(normalizeVoiceMime("Audio/MP4")).toBe("audio/mp4");
    expect(normalizeVoiceMime("audio/mpeg")).toBeNull();
    expect(normalizeVoiceMime("")).toBeNull();
  });
});

describe("sniffVoiceMime", () => {
  it("recognizes WebM and MP4 by their leading bytes, whatever the declared type", () => {
    expect(sniffVoiceMime(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("audio/webm");
    expect(sniffVoiceMime(new Uint8Array([0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]))).toBe("audio/mp4");
    expect(sniffVoiceMime(new TextEncoder().encode("not audio at all"))).toBeNull();
    expect(sniffVoiceMime(new Uint8Array())).toBeNull();
  });
});
