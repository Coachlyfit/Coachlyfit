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
  ClipboardCheck,
  type LucideIcon,
} from "lucide-react";
import type { PlanFeature } from "@/lib/features";

export type NavItem = {
  href: string;
  labelKey: "dashboard" | "clients" | "programs" | "diets" | "forms" | "review" | "library" | "finance" | "settings" | "admin" | "inbox" | "feedback" | "online" | "requests" | "emails" | "leads" | "site" | "tasks" | "support" | "guides";
  icon: LucideIcon;
  /** Live count shown next to the label -- see UnreadMessagesBadge and
   * SupportUnreadBadge. */
  badge?: "unreadMessages" | "supportUnread";
  /** Only shown when the tenant's plan includes this feature. */
  feature?: PlanFeature;
  /** Only shown to the tenant owner, not to team members. */
  ownerOnly?: boolean;
  /** Shorter label (nav.shell.*) for the 88px collapsed rail, where the full
   * label doesn't fit. Falls back to labelKey. */
  shortLabelKey?: "shortDashboard" | "shortLibrary" | "shortLeads";
};

export type NavGroup = {
  /** nav.shell.* key; omitted for an unlabelled group. */
  labelKey?: "groupClients" | "groupContent" | "groupAccount" | "groupCoaches" | "groupGrowth";
  hrefs: string[];
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
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard, shortLabelKey: "shortDashboard" },
  { href: "/clients", labelKey: "clients", icon: Users },
  { href: "/programs", labelKey: "programs", icon: ClipboardList },
  { href: "/forms", labelKey: "forms", icon: FileText },
  { href: "/review", labelKey: "review", icon: ClipboardCheck },
  { href: "/library", labelKey: "library", icon: Dumbbell, shortLabelKey: "shortLibrary" },
  { href: "/diets", labelKey: "diets", icon: Salad },
  { href: "/tasks", labelKey: "tasks", icon: ListTodo, feature: "task_management" },
  { href: "/finance", labelKey: "finance", icon: Wallet, ownerOnly: true },
  { href: "/settings", labelKey: "settings", icon: Settings },
  { href: "/messages", labelKey: "inbox", icon: MessageCircle, badge: "unreadMessages" },
  { href: "/guides", labelKey: "guides", icon: CirclePlay },
  { href: "/support", labelKey: "support", icon: LifeBuoy, badge: "supportUnread", ownerOnly: true },
];

// Separate list, not an append to NAV_ITEMS: an admin is not a coach with
// extra pages — none of the coach routes are reachable for them (the (coach)
// layout bounces on role), so sharing one array would render dead links.
export const ADMIN_NAV_ITEMS: NavItem[] = [
  { href: "/admin", labelKey: "admin", icon: LayoutDashboard, shortLabelKey: "shortDashboard" },
  { href: "/admin/requests", labelKey: "requests", icon: Inbox },
  { href: "/admin/support", labelKey: "support", icon: LifeBuoy, badge: "supportUnread" },
  { href: "/admin/online", labelKey: "online", icon: Radio },
  { href: "/admin/library", labelKey: "library", icon: Dumbbell, shortLabelKey: "shortLibrary" },
  { href: "/admin/feedback", labelKey: "feedback", icon: MessageSquareText },
  { href: "/admin/emails", labelKey: "emails", icon: Mail },
  { href: "/admin/leads", labelKey: "leads", icon: UserPlus, shortLabelKey: "shortLeads" },
  { href: "/admin/site", labelKey: "site", icon: Globe },
  { href: "/admin/settings", labelKey: "settings", icon: Settings },
];

// Sidebar sections. The collapsed rail ignores the labels and renders the
// groups as one flat list. Every NAV_ITEMS / ADMIN_NAV_ITEMS href must appear
// in exactly one group, or the item silently vanishes from the sidebar
// (nav-items.test.ts enforces it). Item order here, not in NAV_ITEMS, is what
// the sidebar shows; NAV_ITEMS order still drives the bottom nav and palette.
export const COACH_NAV_GROUPS: NavGroup[] = [
  { hrefs: ["/dashboard"] },
  { labelKey: "groupClients", hrefs: ["/clients", "/review", "/messages", "/tasks"] },
  { labelKey: "groupContent", hrefs: ["/programs", "/forms", "/library", "/diets"] },
  { labelKey: "groupAccount", hrefs: ["/finance", "/settings", "/guides", "/support"] },
];

export const ADMIN_NAV_GROUPS: NavGroup[] = [
  { hrefs: ["/admin"] },
  { labelKey: "groupCoaches", hrefs: ["/admin/requests", "/admin/online", "/admin/support", "/admin/feedback"] },
  { labelKey: "groupGrowth", hrefs: ["/admin/leads", "/admin/emails"] },
  { labelKey: "groupContent", hrefs: ["/admin/library", "/admin/site"] },
  { hrefs: ["/admin/settings"] },
];

// Bottom tab bar caps at 5 items (bottom-nav-limit); the rest live behind
// the "more" sheet — see BottomNav.
export const BOTTOM_NAV_PRIMARY = NAV_ITEMS.slice(0, 4);
export const BOTTOM_NAV_OVERFLOW = NAV_ITEMS.slice(4);
