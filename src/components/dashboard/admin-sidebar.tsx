"use client";

import { ADMIN_NAV_ITEMS } from "./nav-items";
import { Sidebar } from "./sidebar";

export function AdminSidebar() {
  return <Sidebar items={ADMIN_NAV_ITEMS} />;
}
