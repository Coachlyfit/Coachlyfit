import { describe, expect, it } from "vitest";
import { ADMIN_NAV_GROUPS, ADMIN_NAV_ITEMS, COACH_NAV_GROUPS, NAV_ITEMS, type NavGroup, type NavItem } from "./nav-items";

function check(items: NavItem[], groups: NavGroup[]) {
  const grouped = groups.flatMap((g) => g.hrefs).sort();
  expect(grouped).toEqual(items.map((i) => i.href).sort());
}

describe("sidebar nav groups", () => {
  it("place every coach nav item in exactly one group", () => check(NAV_ITEMS, COACH_NAV_GROUPS));
  it("place every admin nav item in exactly one group", () => check(ADMIN_NAV_ITEMS, ADMIN_NAV_GROUPS));
});
