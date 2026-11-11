"use client";

import { ADMIN_NAV_GROUPS, ADMIN_NAV_ITEMS } from "./nav-items";
import { Sidebar } from "./sidebar";

// ADMIN_NAV_ITEMS carries lucide icon components, which aren't serializable
// across the Server->Client boundary, so this client wrapper imports it
// instead of the (admin) Server Component layout passing it down.
export function AdminSidebar({ defaultCollapsed }: { defaultCollapsed: boolean }) {
  return <Sidebar variant="admin" items={ADMIN_NAV_ITEMS} groups={ADMIN_NAV_GROUPS} defaultCollapsed={defaultCollapsed} />;
}
