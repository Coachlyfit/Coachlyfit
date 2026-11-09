import { describe, expect, it } from "vitest";
import { AvatarService, AvatarError } from "./avatar.service";

// Same fake-DB pattern as presence.service.test.ts: no real Postgres, just
// asserting the calls the service makes and the validation it enforces.
function fakeSupabase(overrides: {
  selectResult?: { data: { avatar_url: string | null } | null; error: unknown };
  uploadResult?: { error: unknown };
  updateResult?: { error: unknown };
  removeResult?: { error: unknown };
} = {}) {
  const calls: { fn: string; args: unknown }[] = [];
  const storageCalls: { fn: string; args: unknown }[] = [];
  const selectResult = overrides.selectResult ?? { data: { avatar_url: null }, error: null };
  const uploadResult = overrides.uploadResult ?? { error: null };
  const updateResult = overrides.updateResult ?? { error: null };
  const removeResult = overrides.removeResult ?? { error: null };

  const db = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: () => Promise.resolve(selectResult),
              };
            },
          };
        },
        update() {
          return {
            eq: () => Promise.resolve(updateResult),
          };
        },
      };
    },
    storage: {
      from() {
        return {
          upload: () => Promise.resolve(uploadResult),
          remove: () => Promise.resolve(removeResult),
          getPublicUrl: () => ({ data: { publicUrl: "https://example.com/storage/v1/object/public/avatars/u1/avatar.jpg" } }),
        };
      },
    },
    rpc() {
      return Promise.resolve({ data: null, error: null });
    },
  } as never;

  return { db, calls, storageCalls };
}

describe("AvatarService", () => {
  it("rejects a non-image file server-side", async () => {
    const { db } = fakeSupabase();
    const file = new File(["hello"], "resume.pdf", { type: "application/pdf" });
    await expect(new AvatarService(db).upload("u1", file)).rejects.toBeInstanceOf(AvatarError);
  });

  it("rejects a file over 2 MB server-side", async () => {
    const { db } = fakeSupabase();
    const file = new File([new ArrayBuffer(3 * 1024 * 1024)], "big.png", { type: "image/png" });
    await expect(new AvatarService(db).upload("u1", file)).rejects.toBeInstanceOf(AvatarError);
  });

  it("uploads a valid image, replaces the stored path and clears on remove", async () => {
    let selectData: { avatar_url: string | null } | null = { avatar_url: null };
    let uploadPath: string | null = null;
    const removedPaths: string[][] = [];
    let updatedPath: string | null = null;

    const db = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: () => Promise.resolve({ data: selectData, error: null }),
                };
              },
            };
          },
          update(values: { avatar_url: string | null }) {
            return {
              eq: () => {
                updatedPath = values.avatar_url;
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      },
      storage: {
        from() {
          return {
            upload: (path: string) => {
              uploadPath = path;
              return Promise.resolve({ error: null });
            },
            remove: (paths: string[]) => {
              removedPaths.push(paths);
              return Promise.resolve({ error: null });
            },
            getPublicUrl: () => ({ data: { publicUrl: "https://example.com/x" } }),
          };
        },
      },
    } as never;

    const service = new AvatarService(db);
    const file = new File([new ArrayBuffer(100)], "photo.png", { type: "image/png" });

    const path = await service.upload("u1", file);
    expect(path).toBe("u1/avatar.png");
    expect(uploadPath).toBe("u1/avatar.png");
    expect(updatedPath).toBe("u1/avatar.png");

    // Same extension -> upload overwrites in place, no separate delete of the
    // old path (there was none anyway).
    expect(removedPaths).toEqual([]);

    // Changing extension deletes the old path after the new file is in place.
    selectData = { avatar_url: "u1/avatar.png" };
    const file2 = new File([new ArrayBuffer(100)], "photo.webp", { type: "image/webp" });
    await service.upload("u1", file2);
    expect(uploadPath).toBe("u1/avatar.webp");
    expect(removedPaths).toEqual([["u1/avatar.png"]]);

    // Now the stored avatar is the webp, so remove() deletes it.
    selectData = { avatar_url: "u1/avatar.webp" };
    await service.remove("u1");
    expect(updatedPath).toBe(null);
    expect(removedPaths).toEqual([["u1/avatar.png"], ["u1/avatar.webp"]]);
  });

  it("remove() is a no-op for the store when no avatar is set", async () => {
    let updatedPath: string | null = "u1/avatar.jpg";
    const db = {
      from() {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: () => Promise.resolve({ data: { avatar_url: null }, error: null }),
                };
              },
            };
          },
          update(values: { avatar_url: string | null }) {
            return {
              eq: () => {
                updatedPath = values.avatar_url;
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      },
      storage: {
        from() {
          return {
            upload: () => Promise.resolve({ error: null }),
            remove: () => Promise.resolve({ error: null }),
            getPublicUrl: () => ({ data: { publicUrl: "https://example.com/x" } }),
          };
        },
      },
    } as never;

    await new AvatarService(db).remove("u1");
    expect(updatedPath).toBe(null);
  });

  it("surfaces storage upload errors as upload_failed", async () => {
    const { db } = fakeSupabase({ uploadResult: { error: new Error("bucket full") } });
    const file = new File([new ArrayBuffer(100)], "photo.jpg", { type: "image/jpeg" });
    await expect(new AvatarService(db).upload("u1", file)).rejects.toThrow(AvatarError);
    await expect(new AvatarService(db).upload("u1", file)).rejects.toThrow("upload_failed");
  });

  it("avatarUrl() builds the public URL from a path", async () => {
    const { db } = fakeSupabase();
    expect(new AvatarService(db).avatarUrl("u1/avatar.jpg")).toBe(
      "https://example.com/storage/v1/object/public/avatars/u1/avatar.jpg",
    );
    expect(new AvatarService(db).avatarUrl(null)).toBeNull();
  });
});
