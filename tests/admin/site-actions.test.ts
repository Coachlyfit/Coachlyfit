import { beforeEach, describe, expect, it, vi } from "vitest";

// The actions are individually addressable POST endpoints, so each one has to
// refuse a non-admin on its own. requireAdmin is replaced with one that says
// no, and the service with one that records being constructed: a refused
// call must never get as far as the database.
const guard = vi.hoisted(() => ({ result: { error: "forbidden" } as { error: string }, constructed: 0 }));

vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: async () => guard.result }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/domain/marketing/marketing.service", () => ({
  MarketingService: class {
    constructor() {
      guard.constructed += 1;
    }
  },
}));

import * as actions from "@/app/[locale]/(admin-editor)/admin/site/actions";

const ID = "3f1d0c52-6f0b-4b7e-9a51-2f6f3f0f6f10";

const calls: Record<keyof typeof actions, () => Promise<unknown>> = {
  getDraftAction: () => actions.getDraftAction(ID),
  saveSectionAction: () => actions.saveSectionAction(ID, "final_cta", { is_visible: false }),
  addSectionAction: () => actions.addSectionAction(ID, "faq", 3),
  deleteSectionAction: () => actions.deleteSectionAction(ID),
  reorderSectionsAction: () => actions.reorderSectionsAction(ID, [ID]),
  publishAction: () => actions.publishAction(ID),
  listVersionsAction: () => actions.listVersionsAction(ID),
  restoreVersionAction: () => actions.restoreVersionAction(ID),
};

beforeEach(() => {
  guard.constructed = 0;
});

describe("site editor actions", () => {
  // Typed against the module, so adding an action without adding it here is a
  // type error rather than an untested endpoint.
  it("covers every exported action", () => {
    expect(Object.keys(calls).sort()).toEqual(Object.keys(actions).sort());
  });

  it.each(Object.keys(calls) as (keyof typeof actions)[])("%s refuses a non-admin", async (name) => {
    guard.result = { error: "forbidden" };
    expect(await calls[name]()).toEqual({ error: "forbidden" });
    expect(guard.constructed).toBe(0);
  });

  it.each(Object.keys(calls) as (keyof typeof actions)[])("%s refuses a signed-out caller", async (name) => {
    guard.result = { error: "not_authenticated" };
    expect(await calls[name]()).toEqual({ error: "not_authenticated" });
    expect(guard.constructed).toBe(0);
  });

  it("rejects malformed input before anything else", async () => {
    expect(await actions.saveSectionAction("not-a-uuid", "final_cta", {})).toEqual({ error: "invalid_input" });
    expect(await actions.saveSectionAction(ID, "carousel", {})).toEqual({ error: "invalid_input" });
    expect(await actions.saveSectionAction(ID, "faq", { content_ar: { title: "no items" } })).toEqual({
      error: "invalid_input",
    });
    expect(await actions.saveSectionAction(ID, "faq", { settings: { background: "pink" } })).toEqual({
      error: "invalid_input",
    });
    expect(await actions.addSectionAction(ID, "faq", 0)).toEqual({ error: "invalid_input" });
    expect(await actions.reorderSectionsAction(ID, ["nope"])).toEqual({ error: "invalid_input" });
  });
});
