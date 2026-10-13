import {
  LayoutDashboard,
  Users,
  ClipboardList,
  FileText,
  Dumbbell,
  Salad,
  Wallet,
  Settings,
  MessageCircle,
  MessageSquareText,
  Radio,
  Inbox,
  Mail,
  Globe,
  ListTodo,
  UserPlus,
  LifeBuoy,
  CirclePlay,
  type LucideIcon,
} from "lucide-react";
import type { PlanFeature } from "@/lib/features";

export type NavItem = {
  href: string;
  labelKey: "dashboard" | "clients" | "programs" | "diets" | "forms" | "library" | "finance" | "settings" | "admin" | "inbox" | "feedback" | "online" | "requests" | "emails" | "leads" | "site" | "tasks" | "support" | "guides";
  icon: LucideIcon;
  /** Live count shown next to the label -- see UnreadMessagesBadge and
   * SupportUnreadBadge. */
  badge?: "unreadMessages" | "supportUnread";
  /** Only shown when the tenant's plan includes this feature. */
  feature?: PlanFeature;
  /** Only shown to the tenant owner, not to team members. */
  ownerOnly?: boolean;
};

export type NavFeatures = Partial<Record<PlanFeature, boolean>>;

/** Drops the items the plan doesn't include, and the owner-only ones for a
 * team member. Hiding only: the page behind a gated item checks for itself,
 * and the database refuses the data. */
export function visibleNavItems(items: NavItem[], features?: NavFeatures, isOwner = true): NavItem[] {
  return items.filter(
    (item) => (!item.feature || features?.[item.feature] === true) && (!item.ownerOnly || isOwner),
  );
}

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
  { href: "/tasks", labelKey: "tasks", icon: ListTodo, feature: "task_management" },
  { href: "/finance", labelKey: "finance", icon: Wallet },
  { href: "/settings", labelKey: "settings", icon: Settings },
  { href: "/messages", labelKey: "inbox", icon: MessageCircle, badge: "unreadMessages" },
  { href: "/guides", labelKey: "guides", icon: CirclePlay },
  { href: "/support", labelKey: "support", icon: LifeBuoy, badge: "supportUnread", ownerOnly: true },
];

// Separate list, not an append to NAV_ITEMS: an admin is not a coach with
// extra pages — none of the coach routes are reachable for them (the (coach)
// layout bounces on role), so sharing one array would render dead links.
export const ADMIN_NAV_ITEMS: NavItem[] = [
  { href: "/admin", labelKey: "admin", icon: LayoutDashboard },
  { href: "/admin/requests", labelKey: "requests", icon: Inbox },
  { href: "/admin/support", labelKey: "support", icon: LifeBuoy, badge: "supportUnread" },
  { href: "/admin/online", labelKey: "online", icon: Radio },
  { href: "/admin/library", labelKey: "library", icon: Dumbbell },
  { href: "/admin/feedback", labelKey: "feedback", icon: MessageSquareText },
  { href: "/admin/emails", labelKey: "emails", icon: Mail },
  { href: "/admin/leads", labelKey: "leads", icon: UserPlus },
  { href: "/admin/site", labelKey: "site", icon: Globe },
  { href: "/admin/settings", labelKey: "settings", icon: Settings },
];

// Bottom tab bar caps at 5 items (bottom-nav-limit); the rest live behind
// the "more" sheet — see BottomNav.
export const BOTTOM_NAV_PRIMARY = NAV_ITEMS.slice(0, 4);
export const BOTTOM_NAV_OVERFLOW = NAV_ITEMS.slice(4);
