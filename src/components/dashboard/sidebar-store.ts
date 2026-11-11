import { create } from "zustand";

export type ShellRole = "coach" | "admin";

/** One cookie per role so a user who is both never shares a preference. */
export const SIDEBAR_COOKIE: Record<ShellRole, string> = {
  coach: "sidebar_coach",
  admin: "sidebar_admin",
};

/** Layouts call this with the raw cookie value so SSR renders the saved state
 * (no flash). Default: coach expanded, admin collapsed. */
export function collapsedFromCookie(value: string | undefined, role: ShellRole): boolean {
  if (value === "1") return true;
  if (value === "0") return false;
  return role === "admin";
}

// null until the user toggles: until then everything renders from the
// cookie-derived prop the server passed, so SSR and hydration always agree.
type SidebarState = {
  collapsed: Record<ShellRole, boolean | null>;
  toggle: (role: ShellRole, current: boolean) => void;
};

export const useSidebarStore = create<SidebarState>((set) => ({
  collapsed: { coach: null, admin: null },
  toggle: (role, current) => {
    const next = !current;
    document.cookie = `${SIDEBAR_COOKIE[role]}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
    set((s) => ({ collapsed: { ...s.collapsed, [role]: next } }));
  },
}));

export function useSidebarCollapsed(role: ShellRole, initial: boolean): [boolean, () => void] {
  const stored = useSidebarStore((s) => s.collapsed[role]);
  const toggle = useSidebarStore((s) => s.toggle);
  const collapsed = stored ?? initial;
  return [collapsed, () => toggle(role, collapsed)];
}
