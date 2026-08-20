import { describe, expect, it } from "vitest";
import { toEmbedUrl, resolveExerciseMedia } from "./video-embed";

describe("toEmbedUrl", () => {
  it("converts a youtube watch URL", () => {
    expect(toEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ"
    );
  });

  it("converts a youtu.be short link", () => {
    expect(toEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ"
    );
  });

  it("converts a vimeo URL", () => {
    expect(toEmbedUrl("https://vimeo.com/76979871")).toBe(
      "https://player.vimeo.com/video/76979871"
    );
  });

  it("returns null for an unsupported host", () => {
    expect(toEmbedUrl("https://example.com/video.mp4")).toBeNull();
  });

  it("returns null for a malformed URL instead of throwing", () => {
    expect(toEmbedUrl("not a url")).toBeNull();
  });
});

describe("resolveExerciseMedia", () => {
  it("returns null for a missing url", () => {
    expect(resolveExerciseMedia(null)).toBeNull();
    expect(resolveExerciseMedia(undefined)).toBeNull();
  });

  it("classifies a youtube link as embed", () => {
    expect(resolveExerciseMedia("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      kind: "embed",
      src: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    });
  });

  it("classifies a raw gif url as image — the openGym seed shape", () => {
    expect(
      resolveExerciseMedia("https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/exercise.gif")
    ).toEqual({
      kind: "image",
      src: "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/exercise.gif",
    });
  });

  it("classifies other image extensions as image", () => {
    expect(resolveExerciseMedia("https://example.com/a.PNG")?.kind).toBe("image");
    expect(resolveExerciseMedia("https://example.com/a.webp")?.kind).toBe("image");
  });

  it("falls back to link for an unrecognized url", () => {
    expect(resolveExerciseMedia("https://example.com/watch/12")).toEqual({
      kind: "link",
      src: "https://example.com/watch/12",
    });
  });

  it("rejects a non-http(s) scheme instead of handing it to an iframe/img src", () => {
    expect(resolveExerciseMedia("javascript:alert(1)")).toBeNull();
    expect(resolveExerciseMedia("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("returns null for a malformed url", () => {
    expect(resolveExerciseMedia("not a url")).toBeNull();
  });
});
