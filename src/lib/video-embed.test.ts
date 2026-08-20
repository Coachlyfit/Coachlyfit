import { describe, expect, it } from "vitest";
import { toEmbedUrl } from "./video-embed";

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
