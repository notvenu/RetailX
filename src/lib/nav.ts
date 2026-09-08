import {
  LayoutGrid,
  Landmark,
  ShoppingBag,
  Boxes,
  Truck,
  Users,
  Activity,
  TrendingUp,
  Scale,
  Building2,
  type LucideIcon,
} from "lucide-react";
import { ACCESS } from "@/lib/access";
import type { Role } from "@/lib/users";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  group: "Overview" | "Operations" | "Intelligence";
  roles: Role[];
};

export const NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutGrid, group: "Overview", roles: ACCESS["/"] },
  { href: "/finance", label: "Finance", icon: Landmark, group: "Operations", roles: ACCESS["/finance"] },
  { href: "/sales", label: "Sales & CRM", icon: ShoppingBag, group: "Operations", roles: ACCESS["/sales"] },
  { href: "/inventory", label: "Inventory", icon: Boxes, group: "Operations", roles: ACCESS["/inventory"] },
  { href: "/procurement", label: "Procurement", icon: Truck, group: "Operations", roles: ACCESS["/procurement"] },
  { href: "/hr", label: "People & Payroll", icon: Users, group: "Operations", roles: ACCESS["/hr"] },
  { href: "/analytics", label: "Analytics", icon: Activity, group: "Intelligence", roles: ACCESS["/analytics"] },
  { href: "/forecasting", label: "Forecasting", icon: TrendingUp, group: "Intelligence", roles: ACCESS["/forecasting"] },
  { href: "/decision-support", label: "Decision support", icon: Scale, group: "Intelligence", roles: ACCESS["/decision-support"] },
  { href: "/branch-evaluation", label: "Branch evaluation", icon: Building2, group: "Intelligence", roles: ACCESS["/branch-evaluation"] },
];

export const NAV_GROUPS = ["Overview", "Operations", "Intelligence"] as const;

export function navFor(role: Role): NavItem[] {
  return NAV.filter((n) => n.roles.includes(role));
}
