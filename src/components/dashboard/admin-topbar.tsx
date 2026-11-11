"use client";

import { ADMIN_NAV_ITEMS } from "./nav-items";
import { Topbar } from "./topbar";

// Mirrors admin-sidebar.tsx: ADMIN_NAV_ITEMS carries lucide icon components,
// which aren't serializable across the Server->Client boundary -- importing
// it here (client-side) instead of passing it down from the Server
// Component (admin) layout avoids that crash.
export function AdminTopbar({
  locale,
  fullName,
  userId,
  defaultCollapsed,
}: {
  locale: string;
  fullName: string | null;
  userId: string;
  defaultCollapsed: boolean;
}) {
  return (
    <Topbar
      variant="admin"
      locale={locale}
      fullName={fullName}
      userId={userId}
      navItems={ADMIN_NAV_ITEMS}
      defaultCollapsed={defaultCollapsed}
    />
  );
}
