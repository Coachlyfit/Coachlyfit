import {
  LayoutDashboard,
  Users,
  ClipboardList,
  FileText,
  Dumbbell,
  Salad,
  CreditCard,
  Settings,
  MessageCircle,
  MessageSquareText,
  Radio,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  labelKey: "dashboard" | "clients" | "programs" | "diets" | "forms" | "library" | "billing" | "settings" | "admin" | "inbox" | "feedback" | "online";
  icon: LucideIcon;
};

// No standalone "progress" page: a coach views a client's check-ins and
// charts on that client's own detail page (/clients/[clientId]), not
// aggregated across the roster.
//
// "programs" sits at index 2 (before forms), which pushes library out of
// BOTTOM_NAV_PRIMARY into the "more" sheet below. Deliberate: a coach opens
// programs daily, while the library is mostly reached from inside the
// program builder's exercise picker, not as a standalone destination.
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/clients", labelKey: "clients", icon: Users },
  { href: "/programs", labelKey: "programs", icon: ClipboardList },
  { href: "/forms", labelKey: "forms", icon: FileText },
  { href: "/library", labelKey: "library", icon: Dumbbell },
  { href: "/diets", labelKey: "diets", icon: Salad },
  { href: "/billing", labelKey: "billing", icon: CreditCard },
  { href: "/settings", labelKey: "settings", icon: Settings },
  { href: "/inbox", labelKey: "inbox", icon: MessageCircle },
];

// Separate list, not an append to NAV_ITEMS: an admin is not a coach with
// extra pages — none of the coach routes are reachable for them (the (coach)
// layout bounces on role), so sharing one array would render dead links.
export const ADMIN_NAV_ITEMS: NavItem[] = [
  { href: "/admin", labelKey: "admin", icon: LayoutDashboard },
  { href: "/admin/online", labelKey: "online", icon: Radio },
  { href: "/admin/library", labelKey: "library", icon: Dumbbell },
  { href: "/admin/feedback", labelKey: "feedback", icon: MessageSquareText },
  { href: "/admin/settings", labelKey: "settings", icon: Settings },
];

// Bottom tab bar caps at 5 items (bottom-nav-limit); the rest live behind
// the "more" sheet — see BottomNav.
export const BOTTOM_NAV_PRIMARY = NAV_ITEMS.slice(0, 4);
export const BOTTOM_NAV_OVERFLOW = NAV_ITEMS.slice(4);
